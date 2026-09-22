/**
 * Phase 16.1 — Narrative Engine (Claude 3.5 Sonnet).
 *
 * Implements the Stage-1 story-composition layer of the AI Narrative &
 * Production Pipeline: given a raw user concept and guided answers, Claude
 * expands it into a rich, cinematic, 3–5 scene story loaded with sensory
 * anchors (lighting, atmosphere, physical action, environmental sound cues)
 * and age-appropriate internal conflict.
 *
 * Fail-closed: the engine is inert unless BOTH `STORY_NARRATIVE_ENGINE_ENABLED`
 * is true AND a key is present (`CLAUDE_API`, alias `ANTHROPIC_API_KEY`). When
 * inactive or on any provider failure it delegates to the wrapped provider
 * (the existing OpenAI-compatible / deterministic chain), preserving today's
 * behaviour exactly.
 *
 * Server-only module. `CLAUDE_API` must never be exposed client-side.
 */

import type { GeneratedStory, StoryAnswer, StoryAudienceMode, StoryTextProvider } from './storyTextService';
import {
  generatedStorySchema,
  normaliseGeneratedStoryPayload,
  parseJsonObject,
} from './storyTextService';

export const NARRATIVE_ENGINE_FLAG = 'STORY_NARRATIVE_ENGINE_ENABLED';
// Sonnet-class default — the PRD's "Claude 3.5 Sonnet" maps to the current
// Sonnet line on this account (`claude-sonnet-4-5`; the legacy 3.5 model
// aliases return 404 here). Overridable via CLAUDE_STORY_MODEL.
export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-5';
export const CLAUDE_ANTHROPIC_VERSION = '2023-06-01';
const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

/** True only when the operator has enabled the engine AND a key is configured. */
export function isNarrativeEngineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env[NARRATIVE_ENGINE_FLAG] !== 'true') return false;
  return Boolean(claudeApiKey(env));
}

/** Claude API key — `CLAUDE_API` with `ANTHROPIC_API_KEY` alias. */
export function claudeApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.CLAUDE_API ?? env.ANTHROPIC_API_KEY;
}

/** Claude model for story composition (overridable). */
export function claudeStoryModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_STORY_MODEL ?? CLAUDE_DEFAULT_MODEL;
}

/** Rollout percent (0–100) for the canary. Empty/unset = 100 (flag governs). */
export function narrativeEngineRolloutPercent(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.STORY_NARRATIVE_ENGINE_ROLLOUT;
  if (raw === undefined || raw.trim() === '') return 100;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
}

/** Explicit operator allowlist (emails/usernames/userIds), canary escape hatch. */
export function narrativeEngineAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.STORY_NARRATIVE_ENGINE_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Per-user canary decision: the engine runs for a user when it is globally
 * enabled AND (the user is allowlisted OR their stable id-hash falls inside
 * `STORY_NARRATIVE_ENGINE_ROLLOUT` percent). No user context → default on
 * (the global flag governs), which keeps tests/background paths simple.
 */
export function shouldUseNarrativeEngine(userId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isNarrativeEngineEnabled(env)) return false;
  if (!userId) return true;
  const allowlist = narrativeEngineAllowlist(env);
  if (allowlist.includes(userId.toLowerCase())) return true;
  const percent = narrativeEngineRolloutPercent(env);
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return hash % 100 < percent;
}

export interface ClaudeNarrativeDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

const SAFETY_RULES: Record<StoryAudienceMode, string> = {
  KIDS:
    'SAFETY (KIDS): child-safe, warm, friendly, and hopeful. No graphic violence, fear-inducing horror, adult themes, or unsafe instructions. Keep language simple and positive.',
  GENERAL:
    'SAFETY (GENERAL): no sexual content, graphic violence, hateful themes, dangerous instructions, or gore.',
};

const STAGE_1_SYSTEM = [
  'You are an award-winning screenwriter and narrative director.',
  'Take a raw, simple user concept and expand it into a rich, immersive 3 to 5 scene story.',
  'CRITICAL DIRECTIVES:',
  '1. Avoid clichés, passive phrasing, and flat plots.',
  '2. Focus heavily on sensory anchors: lighting, atmosphere, physical actions, and environmental sound cues.',
  '3. Build internal conflict and dramatic tension into every scene (age-appropriate).',
  '4. Output the story body with clear scene headings (SCENE 1, SCENE 2, ...) and deep narrative prose suitable for screen adaptation.',
  '5. THE BODY MUST BE COMPLETE AND FINISHED: write every scene fully, end the last scene with a satisfying closing sentence, and always terminate the body with terminal punctuation. NEVER stop mid-sentence or mid-word. A complete shorter story is far better than a truncated long one.',
  '6. Budget your output: roughly 250-400 words per scene. Prioritize FINISHING the story over maximal length — if you are running low on output room, wrap the story up cleanly instead of starting another scene you cannot finish.',
  'Return ONLY strict JSON matching this shape: title, summary, body, ageRange, mainCharacterName, supportingCharacters, theme, sceneHints (array of {title, description, locationType?, indoorOutdoor?, mood?, characters?}), characterMemory (array of {name, role?, species?, ageDescription?, gender?, visualDescription?, personality?}).',
];

const STAGE_1_CONTINUE_SYSTEM = [
  'You are an award-winning screenwriter continuing an ongoing Raivstream story.',
  'Preserve character names, tone, setting, unresolved events, and the established style.',
  'Keep the same cinematic craft: sensory anchors (lighting, atmosphere, physical actions, environmental sound cues) and age-appropriate dramatic tension.',
  'Output the new chapter body with clear scene headings (SCENE 1, SCENE 2, ...).',
  'THE BODY MUST BE COMPLETE AND FINISHED: write every scene fully, end with a satisfying closing sentence, and always terminate the body with terminal punctuation. NEVER stop mid-sentence. Prioritize FINISHING the chapter over maximal length.',
  'Return ONLY strict JSON matching this shape: title, summary, body, ageRange, mainCharacterName, supportingCharacters, theme, sceneHints (array of {title, description, locationType?, indoorOutdoor?, mood?, characters?}), characterMemory (array of {name, role?, species?, ageDescription?, gender?, visualDescription?, personality?}).',
];

export function buildNarrativeSystem(audienceMode: StoryAudienceMode, continuation = false): string {
  const base = continuation ? STAGE_1_CONTINUE_SYSTEM : STAGE_1_SYSTEM;
  return [...base, SAFETY_RULES[audienceMode]].join('\n');
}

export class ClaudeNarrativeEngineProvider implements StoryTextProvider {
  private readonly fallback: StoryTextProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly env: NodeJS.ProcessEnv;

  constructor(fallback: StoryTextProvider, deps: ClaudeNarrativeDeps = {}) {
    this.fallback = fallback;
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    this.env = deps.env ?? process.env;
  }

  private get enabled(): boolean {
    return isNarrativeEngineEnabled(this.env);
  }

  private async complete(system: string, user: string, strict = false): Promise<string> {
    const apiKey = claudeApiKey(this.env);
    if (!apiKey) throw new Error('Claude narrative engine is not configured');

    const messages = [{ role: 'user' as const, content: user }];
    if (strict) {
      messages.push({
        role: 'user',
        content:
          'Your previous reply was not parseable. Output ONLY the JSON object now. No commentary, no prose, no markdown code fences. Begin with { and end with }.',
      });
    }

    const response = await this.fetchImpl(`${CLAUDE_MESSAGES_URL}`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': CLAUDE_ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: claudeStoryModel(this.env),
        // A 3–5 scene story with deep narrative prose can exceed 6000 output
        // tokens; the previous cap truncated long stories mid-JSON (the
        // truncated-body bug). 16000 leaves comfortable headroom while billing
        // only charges the tokens actually generated.
        max_tokens: 16000,
        temperature: 0.8,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude narrative engine failed with ${response.status}`);
    }

    const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = payload.content
      ?.filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .filter(Boolean)
      .join('\n');
    if (!text) throw new Error('Claude narrative engine returned no text');
    return text;
  }

  /** Strip markdown fences then parse the story manifest. */
  private parseStory(content: string, sourceIdea: string): GeneratedStory {
    const fenced = content
      .replace(/^```[a-zA-Z]*\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    const parsed = generatedStorySchema.parse(normaliseGeneratedStoryPayload(parseJsonObject(fenced), sourceIdea));
    return { ...parsed, providerMetadata: { provider: 'claude-narrative', model: claudeStoryModel(this.env) } };
  }

  /** Guided questions stay on the existing provider — Stage 1 is story composition. */
  async generateGuidedQuestions(input: string, audienceMode: StoryAudienceMode) {
    return this.fallback.generateGuidedQuestions(input, audienceMode);
  }

  async generateStory(input: string, answers: StoryAnswer[], audienceMode: StoryAudienceMode, opts?: { userId?: string | null }): Promise<GeneratedStory> {
    // Canary: users outside the rollout (or when the engine is off) keep the
    // existing OpenAI/local chain — per-user, not global.
    if (!this.enabled || !shouldUseNarrativeEngine(opts?.userId, this.env)) {
      return this.fallback.generateStory(input, answers, audienceMode);
    }
    try {
      const baseUser = [
        `Idea: ${input}`,
        `Audience mode: ${audienceMode}`,
        `Answers: ${JSON.stringify(answers)}`,
        'Write the cinematic story. Weave lighting, atmosphere, physical action, and environmental sound cues into the prose and into each sceneHints description.',
      ].join('\n');
      let content = await this.complete(buildNarrativeSystem(audienceMode), baseUser);
      try {
        return this.parseStory(content, input);
      } catch {
        // One bounded corrective retry (strict JSON), then fall back.
        content = await this.complete(buildNarrativeSystem(audienceMode), baseUser, true);
        return this.parseStory(content, input);
      }
    } catch (error) {
      console.warn('[narrativeEngine] story fallback:', error);
      return this.fallback.generateStory(input, answers, audienceMode);
    }
  }

  async continueStory(params: {
    projectTitle: string;
    originalIdea: string;
    previousChapters: Array<{ chapterNumber: number; title: string; summary: string; body: string }>;
    audienceMode: StoryAudienceMode;
  }, opts?: { userId?: string | null }): Promise<GeneratedStory> {
    if (!this.enabled || !shouldUseNarrativeEngine(opts?.userId, this.env)) {
      return this.fallback.continueStory(params);
    }
    try {
      const baseUser = [
        `Project title: ${params.projectTitle}`,
        `Original idea: ${params.originalIdea}`,
        `Audience mode: ${params.audienceMode}`,
        `Previous chapters: ${JSON.stringify(params.previousChapters)}`,
        `Write chapter ${params.previousChapters.length + 1}. Return JSON with title, summary, body, ageRange, mainCharacterName, supportingCharacters, theme, sceneHints, and characterMemory.`,
      ].join('\n');
      let content = await this.complete(buildNarrativeSystem(params.audienceMode, true), baseUser);
      try {
        return this.parseStory(content, params.originalIdea || params.projectTitle);
      } catch {
        content = await this.complete(buildNarrativeSystem(params.audienceMode, true), baseUser, true);
        return this.parseStory(content, params.originalIdea || params.projectTitle);
      }
    } catch (error) {
      console.warn('[narrativeEngine] continuation fallback:', error);
      return this.fallback.continueStory(params);
    }
  }

  async rewriteParagraph(params: {
    projectTitle: string;
    chapterNumber: number;
    paragraph: string;
    directive: string;
    audienceMode: StoryAudienceMode;
  }, opts?: { userId?: string | null }): Promise<string> {
    if (!this.enabled || !shouldUseNarrativeEngine(opts?.userId, this.env)) {
      return this.fallback.rewriteParagraph(params);
    }
    try {
      const content = await this.complete(
        [
          'You are a skilled fiction editor for Raivstream Story Playground.',
          'Rewrite ONLY the given paragraph according to the directive.',
          'Keep the same character voices, setting, tone, and style as the surrounding story.',
          'Preserve the meaning unless the directive asks to change it.',
          SAFETY_RULES[params.audienceMode],
          'Return ONLY the rewritten paragraph text — no commentary, no quotes, no markdown.',
        ].join('\n'),
        [
          `Chapter: ${params.chapterNumber} — ${params.projectTitle}`,
          `Audience mode: ${params.audienceMode}`,
          `Directive: ${params.directive}`,
          `Paragraph to rewrite:\n${params.paragraph}`,
        ].join('\n'),
      );
      const rewritten = content.replace(/^```[a-zA-Z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').replace(/^["'\s]+|["'\s]+$/g, '').trim();
      if (!rewritten) throw new Error('Claude returned an empty rewrite');
      return rewritten;
    } catch (error) {
      console.warn('[narrativeEngine] rewrite fallback:', error);
      return this.fallback.rewriteParagraph(params);
    }
  }
}