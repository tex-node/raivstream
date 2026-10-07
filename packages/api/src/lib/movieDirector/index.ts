/**
 * MovieDirector — turns a plain-language scene brief into finished,
 * production-ready cinematic video prompts using the moviedirector skill.
 *
 * Server-only. Uses Claude (CLAUDE_API, alias ANTHROPIC_API_KEY) via the
 * Messages API, the same way narrativeEngine.ts does. No new dependencies.
 *
 * The hard rules the model cannot verify itself are enforced here:
 *   - exact scene count (split on "=== SCENE n ===" markers)
 *   - per-scene character ceiling (counted server-side, never estimated)
 *   - no em dashes (stripped deterministically)
 * One repair pass is attempted when the count or ceiling is wrong.
 */
import { MOVIE_DIRECTOR_SYSTEM_PROMPT } from './systemPrompt';

export { MOVIE_DIRECTOR_SYSTEM_PROMPT };

const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_DIRECTOR_MODEL = 'claude-sonnet-4-5';
const REQUEST_TIMEOUT_MS = 120_000;

export const DIRECTOR_MAX_SCENES = 6;
export const DIRECTOR_CEILINGS = [2000, 4000] as const;
export type DirectorCeiling = (typeof DIRECTOR_CEILINGS)[number];

export type DirectorCastMember = {
  /** Handle without or with the leading "@", e.g. "Max" or "@Max". */
  tag: string;
  /** Physical description / role. Ignored when imageReferenced is true. */
  description?: string;
  /** Voice descriptor, e.g. "A 9-year-old Lagos boy. Bright, quick..." */
  voice?: string;
  /** The generator already has an image reference for this character. */
  imageReferenced?: boolean;
};

export type DirectorReference = {
  label: string;
  purpose: 'CHARACTER' | 'ENVIRONMENT' | 'PROP' | 'OTHER';
  note?: string;
};

export type DirectorInput = {
  scene: string;
  cast: DirectorCastMember[];
  sceneCount: number;
  format: 'CONTINUOUS' | 'CUTS';
  charCeiling: DirectorCeiling;
  references?: DirectorReference[];
  /** Active world established for the project (held constant). */
  world?: string;
  /** Plain-language note on a previous result ("too floaty", ...). */
  revisionNote?: string;
  /** The previous result the revision note applies to. */
  previousScenes?: string[];
};

export type DirectorScenePrompt = {
  index: number;
  prompt: string;
  charCount: number;
  withinCeiling: boolean;
};

export type DirectorOutput = {
  scenes: DirectorScenePrompt[];
  model: string;
  repaired: boolean;
  warnings: string[];
};

type ClaudeMessage = { role: 'user' | 'assistant'; content: string };

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

/** Remove em dashes (and the en-dash look-alike) the way the skill requires. */
export function stripEmDashes(text: string): string {
  return text
    .replace(/\s+[—―]\s+/g, ', ')
    .replace(/[—―]/g, '-')
    .replace(/\s+–\s+/g, ' - ');
}

/** Light cleanup of markdown the model may add despite instructions. */
export function cleanPromptText(text: string): string {
  return stripEmDashes(
    text
      .replace(/^```[a-z]*\s*$/gim, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

export function normaliseTag(tag: string): string {
  const clean = tag.trim().replace(/^@+/, '').replace(/\s+/g, '_');
  return `@${clean}`;
}

/** Split raw model output into scene prompts using "=== SCENE n ===" markers. */
export function splitScenePrompts(raw: string): string[] {
  const marker = /^\s*={2,}\s*SCENE\s+\d+\s*={2,}\s*$/gim;
  const matches = [...raw.matchAll(marker)];
  if (matches.length === 0) {
    const whole = cleanPromptText(raw);
    return whole ? [whole] : [];
  }
  const parts: string[] = [];
  matches.forEach((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? raw.length : raw.length;
    const body = cleanPromptText(raw.slice(start, end));
    if (body) parts.push(body);
  });
  return parts;
}

export function toScenePrompts(parts: string[], ceiling: number): DirectorScenePrompt[] {
  return parts.map((prompt, i) => ({
    index: i + 1,
    prompt,
    charCount: prompt.length,
    withinCeiling: prompt.length <= ceiling,
  }));
}

export function findProblems(scenes: DirectorScenePrompt[], expected: number, ceiling: number): string[] {
  const problems: string[] = [];
  if (scenes.length !== expected) {
    problems.push(`You delivered ${scenes.length} scene prompt(s) but ${expected} were requested. Deliver exactly ${expected}.`);
  }
  for (const s of scenes) {
    if (!s.withinCeiling) {
      problems.push(`Scene ${s.index} is ${s.charCount} characters. The hard ceiling is ${ceiling}. Trim it under ${ceiling} without losing staging, performance or eye life.`);
    }
  }
  return problems;
}

/** Plain-language versions of findProblems for the person using the tool. */
export function describeProblemsForUser(scenes: DirectorScenePrompt[], expected: number, ceiling: number): string[] {
  const notes: string[] = [];
  if (scenes.length !== expected) notes.push(`Got ${scenes.length} of the ${expected} scenes you asked for. Try again or ask for fewer.`);
  for (const s of scenes) {
    if (!s.withinCeiling) notes.push(`Scene ${s.index} is ${s.charCount.toLocaleString('en-US')} characters, over the ${ceiling.toLocaleString('en-US')} limit.`);
  }
  return notes;
}

export function buildDirectorUserMessage(input: DirectorInput): string {
  const lines: string[] = [];
  lines.push(`Number of scene prompts to deliver: ${input.sceneCount}`);
  lines.push(`Hard character ceiling for this request: ${input.charCeiling.toLocaleString('en-US')} characters per scene prompt (this overrides the default).`);
  lines.push(
    input.format === 'CUTS'
      ? 'Coverage: controlled multi-shot sequence with explicit cuts.'
      : 'Coverage: one continuous take per scene (the default).',
  );
  if (input.world?.trim()) lines.push(`Active world (hold constant): ${input.world.trim()}`);

  if (input.cast.length > 0) {
    lines.push('', 'Cast:');
    for (const member of input.cast) {
      const tag = normaliseTag(member.tag);
      if (member.imageReferenced) {
        lines.push(`- ${tag}: already image referenced. Voice: ${member.voice?.trim() || 'choose one that fits and keep it fixed'}.`);
      } else {
        const parts = [member.description?.trim(), member.voice?.trim() ? `Voice: ${member.voice.trim()}` : undefined].filter(Boolean);
        lines.push(`- ${tag}: ${parts.join('. ') || 'no description given, invent one that fits the scene and keep it fixed'}`);
      }
    }
  }

  if (input.references && input.references.length > 0) {
    lines.push('', 'Reference images loaded in the generator:');
    for (const ref of input.references) {
      lines.push(`- ${ref.label} (${ref.purpose.toLowerCase()} reference)${ref.note?.trim() ? `: ${ref.note.trim()}` : ''}`);
    }
  }

  lines.push('', 'Scene brief:', input.scene.trim());
  return lines.join('\n');
}

function buildConversation(input: DirectorInput): ClaudeMessage[] {
  const first: ClaudeMessage = { role: 'user', content: buildDirectorUserMessage(input) };
  const previous = input.previousScenes?.filter((s) => s.trim()) ?? [];
  if (!input.revisionNote?.trim() || previous.length === 0) return [first];
  return [
    first,
    { role: 'assistant', content: previous.map((s, i) => `=== SCENE ${i + 1} ===\n${s}`).join('\n\n') },
    {
      role: 'user',
      content: `Note on that result: "${input.revisionNote.trim()}". Apply it using your feedback shorthand and redeliver all ${input.sceneCount} scene prompt(s) in full, same format.`,
    },
  ];
}

// ─── Claude client ───────────────────────────────────────────────────────────

export type DirectorEnv = Partial<Record<'CLAUDE_API' | 'ANTHROPIC_API_KEY' | 'CLAUDE_DIRECTOR_MODEL' | 'CLAUDE_STORY_MODEL', string>>;

export class MovieDirector {
  constructor(
    private readonly env: DirectorEnv = process.env as DirectorEnv,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private get apiKey() {
    return this.env.CLAUDE_API ?? this.env.ANTHROPIC_API_KEY;
  }

  get model() {
    return this.env.CLAUDE_DIRECTOR_MODEL ?? this.env.CLAUDE_STORY_MODEL ?? DEFAULT_DIRECTOR_MODEL;
  }

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  private async callClaude(messages: ClaudeMessage[], maxTokens: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(CLAUDE_MESSAGES_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': this.apiKey ?? '',
          'anthropic-version': CLAUDE_ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          temperature: 0.8,
          system: MOVIE_DIRECTOR_SYSTEM_PROMPT,
          messages,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Director model request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      }
      const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = (payload.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      if (!text.trim()) throw new Error('Director model returned no text');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  async compose(input: DirectorInput): Promise<DirectorOutput> {
    if (!this.isConfigured) throw new Error('Director is not configured (set CLAUDE_API or ANTHROPIC_API_KEY)');
    const ceiling = input.charCeiling;
    // ~4 chars per token, plus headroom for markers and the repair pass.
    const maxTokens = Math.min(16_000, Math.ceil((ceiling / 3) * input.sceneCount) + 800);

    const conversation = buildConversation(input);
    const raw = await this.callClaude(conversation, maxTokens);
    let scenes = toScenePrompts(splitScenePrompts(raw), ceiling);
    const problems = findProblems(scenes, input.sceneCount, ceiling);
    let repaired = false;

    if (problems.length > 0) {
      try {
        const repairRaw = await this.callClaude(
          [
            ...conversation,
            { role: 'assistant', content: raw },
            { role: 'user', content: `Corrections needed:\n${problems.map((p) => `- ${p}`).join('\n')}\nRedeliver all ${input.sceneCount} scene prompt(s) in full, same format.` },
          ],
          maxTokens,
        );
        const repairedScenes = toScenePrompts(splitScenePrompts(repairRaw), ceiling);
        const repairedProblems = findProblems(repairedScenes, input.sceneCount, ceiling);
        if (repairedProblems.length < problems.length) {
          scenes = repairedScenes;
          repaired = true;
        }
      } catch (error) {
        console.warn('[movieDirector] repair pass failed:', error);
      }
    }

    return { scenes, model: this.model, repaired, warnings: describeProblemsForUser(scenes, input.sceneCount, ceiling) };
  }
}

export const movieDirector = new MovieDirector();
