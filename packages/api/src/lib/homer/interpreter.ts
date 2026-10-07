/**
 * Homer — AI Interpretation Layer.
 *
 * Understands raw natural-language story text and produces a ProposedStoryState.
 * All AI-generated claims carry provenance=PROPOSED.
 * The deterministic reconciler decides what becomes canonical.
 *
 * Uses the same Claude API infrastructure as narrativeEngine.ts.
 * Feature flag: HOMER_INTERPRETER_ENABLED=true
 * Model override: HOMER_INTERPRETER_MODEL (defaults to CLAUDE_DEFAULT_MODEL)
 *
 * Fail-closed: if the interpreter is disabled or fails, returns a fallback
 * ProposedStoryState derived from the raw text without AI (pattern-free).
 */

import { claudeApiKey, CLAUDE_ANTHROPIC_VERSION, CLAUDE_DEFAULT_MODEL } from '../narrativeEngine';
import type {
  HomerCanonFact,
  HomerInterpretationRequest,
  HomerStoryState,
  ProposedStoryBeat,
  ProposedStoryCharacter,
  ProposedStoryLocation,
  ProposedStoryObject,
  ProposedStoryState,
  ProposedStoryThread,
  ProposedWorldState,
} from './types';

export const HOMER_INTERPRETER_FLAG = 'HOMER_INTERPRETER_ENABLED';
const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

export interface HomerInterpreterDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

export function isHomerInterpreterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[HOMER_INTERPRETER_FLAG] === 'true' && Boolean(claudeApiKey(env));
}

function interpreterModel(env: NodeJS.ProcessEnv): string {
  return env.HOMER_INTERPRETER_MODEL ?? CLAUDE_DEFAULT_MODEL;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildInterpreterSystem(audienceMode: 'GENERAL' | 'KIDS', existingEntityNames: string[]): string {
  const safetyNote =
    audienceMode === 'KIDS'
      ? 'SAFETY: This is a child-safe story. Keep all interpretations warm and appropriate for children.'
      : 'SAFETY: Avoid sexual content, graphic violence, or hateful themes.';

  const existingContext =
    existingEntityNames.length > 0
      ? `\nEXISTING ENTITIES (do not re-invent these — resolve references to them where semantically justified): ${existingEntityNames.join(', ')}`
      : '';

  return [
    'You are a Story Intelligence system. Your job is to extract structured story intelligence from natural-language text.',
    'You identify: characters, locations, objects, narrative beats, unresolved threads, world state, and story intent.',
    '',
    'CRITICAL RULES:',
    '1. Extract only what is clearly present or strongly implied in the text. Do not invent.',
    '2. Characters: use their given names. Only include an alias if the text EXPLICITLY describes a character in a way that unambiguously identifies them (e.g. "the old traveler who had been walking for years" immediately after naming that character). Do NOT add he/she/they/him/her as aliases — pronouns are ambiguous and must not be used for identity resolution.',
    '3. If a pronoun reference is ambiguous (two characters of the same gender), leave charactersInvolved as ALL plausible characters — do not guess.',
    '4. Objects: identify objects that participate in narrative actions (picked up, found, touched, heard, used) or that are described with narrative significance. Do not list background props.',
    '5. Beats: every meaningful narrative event is a beat. Use function labels from: setup, introduction, discovery, decision, confrontation, escalation, reveal, consequence, resolution, cliffhanger.',
    '6. Threads: unresolved questions, open conflicts, or unanswered mysteries that carry narrative tension.',
    '7. WorldState: environmental and atmospheric details that would affect visual continuity.',
    '8. Ambiguities: list any references you could not confidently resolve (unknown pronouns, unclear antecedents, unnamed figures).',
    safetyNote,
    existingContext,
    '',
    'Return ONLY a strict JSON object with this exact shape (no prose, no markdown fences):',
    JSON.stringify({
      version: 'proposed_v1',
      interpretedFrom: '(first 80 chars of story text)',
      premise: 'one sentence',
      genre: 'optional string',
      tone: 'optional string',
      themes: ['array of strings'],
      emotionalDirection: 'string describing arc',
      characters: [{
        name: 'string',
        role: 'protagonist|antagonist|supporting|minor|unknown',
        description: 'string',
        aliases: ['only unambiguous contextual refs, never pronouns'],
        narrativeImportance: 'primary|supporting|minor',
        relationships: [{ targetName: 'string', label: 'string' }],
        traits: ['string'],
      }],
      locations: [{
        name: 'string',
        description: 'string',
        role: 'string',
        environmentalCharacteristics: ['string'],
      }],
      objects: [{
        name: 'string',
        description: 'string',
        narrativeImportance: 'critical|notable|minor',
        continuityRequired: true,
      }],
      beats: [{
        ordinal: 1,
        label: 'string',
        description: 'string',
        function: 'setup|introduction|discovery|decision|confrontation|escalation|reveal|consequence|resolution|cliffhanger',
        emotionalDirection: 'string',
        charactersInvolved: ['character names, not pronouns'],
        locationsInvolved: ['location names'],
        objectsInvolved: ['object names'],
      }],
      threads: [{
        description: 'string',
        kind: 'mystery|conflict|promise|question|unresolved_consequence',
        status: 'open|resolved|deferred',
      }],
      worldState: {
        temporalComplexity: 'linear|non-linear|flashback',
        atmosphericDetails: ['string'],
        environmentalFacts: ['string'],
      },
      interpretationConfidence: 'high|medium|low',
      ambiguities: ['string'],
    }),
  ].join('\n');
}

// ─── Claude call ──────────────────────────────────────────────────────────────

function stripJsonFences(text: string): string {
  return text.trim().replace(/^```[a-zA-Z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

function parseProposed(text: string): ProposedStoryState {
  const stripped = stripJsonFences(text);
  // Find the JSON object
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  if (!objMatch) throw new Error('Homer interpreter returned no JSON object');
  const parsed = JSON.parse(objMatch[0]) as Partial<ProposedStoryState>;
  // Minimal validation — accept anything well-formed, default missing fields
  return {
    version: 'proposed_v1',
    interpretedFrom: parsed.interpretedFrom ?? '',
    premise: parsed.premise ?? '',
    genre: parsed.genre,
    tone: parsed.tone,
    themes: parsed.themes ?? [],
    emotionalDirection: parsed.emotionalDirection ?? 'neutral',
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    objects: Array.isArray(parsed.objects) ? parsed.objects : [],
    beats: Array.isArray(parsed.beats) ? parsed.beats : [],
    threads: Array.isArray(parsed.threads) ? parsed.threads : [],
    worldState: parsed.worldState ?? { temporalComplexity: 'linear', atmosphericDetails: [], environmentalFacts: [] },
    interpretationConfidence: parsed.interpretationConfidence ?? 'low',
    ambiguities: parsed.ambiguities ?? [],
  };
}

function existingEntityNames(state: HomerStoryState | null | undefined): string[] {
  if (!state) return [];
  return [
    ...state.entities.characters.map((c) => c.name.value),
    ...state.entities.locations.map((l) => l.name.value),
    ...state.entities.objects.map((o) => o.name.value),
  ].filter(Boolean);
}

// ─── Fallback (no AI) ─────────────────────────────────────────────────────────

/**
 * Minimal fallback when the interpreter is disabled or unavailable.
 * Returns a low-confidence ProposedStoryState with empty extraction.
 * The reconciler will then rely on blueprint-based extraction only.
 */
export function fallbackProposed(storyText: string): ProposedStoryState {
  return {
    version: 'proposed_v1',
    interpretedFrom: storyText.slice(0, 80),
    premise: storyText.slice(0, 160).trim(),
    genre: undefined,
    tone: undefined,
    themes: [],
    emotionalDirection: 'unknown',
    characters: [],
    locations: [],
    objects: [],
    beats: [],
    threads: [],
    worldState: { temporalComplexity: 'linear', atmosphericDetails: [], environmentalFacts: [] },
    interpretationConfidence: 'low',
    ambiguities: ['Interpreter unavailable — no semantic extraction performed'],
  };
}

// ─── HomerInterpreter ─────────────────────────────────────────────────────────

export class HomerInterpreter {
  private readonly fetchImpl: typeof fetch;
  private readonly env: NodeJS.ProcessEnv;

  constructor(deps: HomerInterpreterDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    this.env = deps.env ?? process.env;
  }

  get enabled(): boolean {
    return isHomerInterpreterEnabled(this.env);
  }

  async interpret(request: HomerInterpretationRequest): Promise<ProposedStoryState> {
    if (!this.enabled) {
      return fallbackProposed(request.storyText);
    }

    const apiKey = claudeApiKey(this.env);
    if (!apiKey) return fallbackProposed(request.storyText);

    try {
      const system = buildInterpreterSystem(
        request.audienceMode,
        existingEntityNames(request.existingState),
      );

      const userPrompt = this.buildUserPrompt(request);
      const raw = await this.complete(apiKey, system, userPrompt);
      return parseProposed(raw);
    } catch {
      // Fail-closed: don't corrupt canon, just return low-confidence fallback
      return fallbackProposed(request.storyText);
    }
  }

  private buildUserPrompt(request: HomerInterpretationRequest): string {
    const parts: string[] = [
      `STORY TEXT:\n${request.storyText}`,
    ];

    if (request.existingCanon && request.existingCanon.length > 0) {
      const canonSummary = request.existingCanon
        .map((f) => `${f.label}: ${JSON.stringify(f.value)}`)
        .join('\n');
      parts.push(`\nEXISTING CANON (must not be contradicted unless user explicitly changed it):\n${canonSummary}`);
    }

    if (request.userDecisions && request.userDecisions.length > 0) {
      const decisionSummary = request.userDecisions
        .map((d) => `${d.label}: ${JSON.stringify(d.value)}`)
        .join('\n');
      parts.push(`\nUSER DECISIONS (highest priority — do not contradict):\n${decisionSummary}`);
    }

    parts.push('\nExtract the story intelligence. Return only the JSON object.');
    return parts.join('\n');
  }

  private async complete(apiKey: string, system: string, user: string): Promise<string> {
    const response = await this.fetchImpl(CLAUDE_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': CLAUDE_ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: interpreterModel(this.env),
        max_tokens: 4096,
        temperature: 0.1,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Homer interpreter failed: ${response.status}`);
    }

    const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = payload.content
      ?.filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .filter(Boolean)
      .join('\n');
    if (!text) throw new Error('Homer interpreter returned no content');
    return text;
  }
}

export const homerInterpreter = new HomerInterpreter();
