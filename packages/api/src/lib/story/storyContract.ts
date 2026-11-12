/**
 * The story contract: extracted from the chapter body, scored on content (2026-11-12).
 *
 * WHY THIS IS NOT `storyDna`. The provenance probe settled it: `buildStoryDna` has no chapter-body
 * parameter, derives conflict and resolution from **scene-title regexes**, and falls back to the
 * constants "a gentle obstacle to overcome" / "a positive ending with learning". Its resolution can
 * never be empty, so a contract scored on presence there would pass a story that stops mid-sentence.
 * `storyDna` stays the plan summary it is; this module reads the thing the creator will read.
 *
 * THE ABSTAIN IS THE CONTRACT'S FOUNDATION. A prompt that asks for the fields gets them; a model
 * asked to find a turn will usually find one. So:
 *   - the prompt requires **null** when the body does not contain the thing,
 *   - a parse failure yields **all null** rather than a partial guess,
 *   - the deterministic tier (local-fallback) yields **all null** — it never fabricates a contract,
 *   - a regex over the body is rejected for the same reason a regex over scene titles was rejected:
 *     it produces a resolution for a story that has none.
 *
 * Decisions taken before the code (Job 1): mechanism = **model call with a required abstain**, on the
 * same chain as the narrative engine, with the deterministic tier allowed to return null for every
 * field; timing = **generation time**, stored, so scoring is a read and the same story is never
 * extracted twice; storage = a **new `StoryChapter.storyContract` column**, separate from storyDna.
 */

/**
 * Bumped whenever the extractor's rules tighten. Stored beside the contract so an older, looser
 * reading is distinguishable from a newer one - the errorMessage staleness class, anticipated
 * rather than discovered. The evidence-quoting change bumps this to 2.
 */
export const STORY_CONTRACT_EXTRACTOR_VERSION = 1;

export const STORY_CONTRACT_FIELDS = ['protagonist', 'want', 'obstacle', 'turn', 'resolution'] as const;

export type ResolutionOutcome = 'ANSWERED' | 'DENIED' | 'TRANSFORMED';

export interface StoryResolution {
  /** Does the story answer the want, deny it, or transform it? */
  outcome: ResolutionOutcome;
  /** The sentence (or short paraphrase) that delivers it. */
  text: string;
}

export interface StoryContract {
  /** Each field independently nullable: null means the body does not contain it. */
  protagonist: string | null;
  want: string | null;
  obstacle: string | null;
  turn: string | null;
  resolution: StoryResolution | null;
  /** Optional per-beat sensory anchors, only when the body carries them. */
  sensoryAnchors: string[];
  /** Which engine produced this contract, or 'none' when the deterministic tier abstained. */
  extractedBy: string;
  /** The extractor's rule version, so a tightened rule can find the rows it has not read. */
  extractorVersion?: number;
}

export const EMPTY_STORY_CONTRACT: StoryContract = {
  protagonist: null,
  want: null,
  obstacle: null,
  turn: null,
  resolution: null,
  sensoryAnchors: [],
  extractedBy: 'none',
};

/**
 * The extraction prompt. Two things are load-bearing: null is the required answer when the body
 * lacks a field, and the idea/plan is explicitly out of scope - the model must not answer from what
 * the story was meant to be.
 */
export function storyContractPrompt(): string {
  return [
    'You are reading a finished story and reporting what it CONTAINS. You are not planning or improving it.',
    'Use only the story text you are given. Do not use any idea, outline, or summary that may be implied.',
    'Return strict JSON with exactly these keys:',
    '{',
    '  "protagonist": string|null,   // the named character the story follows, or null',
    '  "want": string|null,          // what that character wants, stated in the story, or null',
    '  "obstacle": string|null,      // what blocks the want, or null',
    '  "turn": string|null,          // what changes the situation, or null',
    '  "resolution": {"outcome": "ANSWERED"|"DENIED"|"TRANSFORMED", "text": string}|null,',
    '  "sensoryAnchors": string[]    // short sensory details actually present, may be empty',
    '}',
    'CRITICAL: if the story does not contain a field, return null for it. Do not infer a want, a turn,',
    'or a resolution that is not written down. A story that stops mid-sentence has resolution null.',
    'Return the JSON object only, with no commentary.',
  ].join('\n');
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asResolution(value: unknown): StoryResolution | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const text = asText(record.text);
  const outcome = record.outcome;
  if (!text) return null;
  if (outcome !== 'ANSWERED' && outcome !== 'DENIED' && outcome !== 'TRANSFORMED') return null;
  return { outcome, text };
}

/**
 * Parse a model response into a contract. **Any** malformed input yields the empty contract rather
 * than a partially filled one: a contract that is half-guessed is worse than one that abstains.
 */
export function parseStoryContract(raw: string | null | undefined, extractedBy: string): StoryContract {
  if (!raw) return { ...EMPTY_STORY_CONTRACT, extractedBy };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...EMPTY_STORY_CONTRACT, extractedBy };
  }
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY_STORY_CONTRACT, extractedBy };
  const record = parsed as Record<string, unknown>;
  return {
    protagonist: asText(record.protagonist),
    want: asText(record.want),
    obstacle: asText(record.obstacle),
    turn: asText(record.turn),
    resolution: asResolution(record.resolution),
    sensoryAnchors: Array.isArray(record.sensoryAnchors)
      ? record.sensoryAnchors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8)
      : [],
    extractedBy,
  };
}

export type StoryContractModel = (input: { system: string; body: string }) => Promise<string | null>;

export interface ExtractStoryContractInput {
  /** The chapter body, and only the body. No scenes, no idea, no interpretation. */
  body: string;
  /** Injected chain: Claude -> OpenAI-compatible -> deterministic. Null means no model available. */
  callModel: StoryContractModel | null;
}

export async function extractStoryContract(input: ExtractStoryContractInput): Promise<StoryContract> {
  const body = (input.body ?? '').trim();
  // No body means nothing to read; no model means the deterministic tier, which abstains entirely.
  if (!body || !input.callModel) return { ...EMPTY_STORY_CONTRACT };

  let raw: string | null = null;
  try {
    raw = await input.callModel({ system: storyContractPrompt(), body });
  } catch {
    return { ...EMPTY_STORY_CONTRACT, extractedBy: 'error' };
  }
  return parseStoryContract(raw, 'model');
}

/**
 * Distinguish the three states a stored contract can be in. The distinction is the difference
 * between a gate and a blank wall: a story that failed and an extractor that failed must not read
 * the same, and neither reads the same as a chapter that was never extracted.
 */
export type StoredContractState = 'absent' | 'failed' | 'extracted';

export function describeStoredContract(stored: unknown): StoredContractState {
  if (stored === null || stored === undefined) return 'absent';
  const record = stored as { extractedBy?: unknown };
  if (record.extractedBy === 'error') return 'failed';
  return 'extracted';
}

export interface StoryContractScore {
  pass: boolean;
  /** Reasons, in the order that matters: a missing resolution first. */
  reasons: string[];
  /** Which of the five content signals are present - coverage, not shape. */
  present: Record<(typeof STORY_CONTRACT_FIELDS)[number], boolean>;
}

/**
 * Score a contract on **content presence and coverage**. Deliberately absent: story length, section
 * count, beat count, word count. Those are the shape signals that produced the six-card template,
 * the seven-slot progression, and `scenes.length === 6`; none of them is read here.
 */
export function scoreStoryContract(contract: StoryContract): StoryContractScore {
  const present = {
    protagonist: Boolean(contract.protagonist),
    want: Boolean(contract.want),
    obstacle: Boolean(contract.obstacle),
    turn: Boolean(contract.turn),
    resolution: Boolean(contract.resolution),
  };

  const reasons: string[] = [];

  // Fail closed, first and separately: no resolution is a failure, not a warning and not partial.
  if (!contract.resolution) {
    reasons.push('RESOLUTION_MISSING: the story does not deliver a resolution, so its want is never answered, denied, or transformed.');
  }
  if (!present.protagonist) reasons.push('PROTAGONIST_MISSING: no named character to follow.');
  if (!present.want) reasons.push('WANT_MISSING: the protagonist wants nothing stated.');
  if (!present.obstacle) reasons.push('OBSTACLE_MISSING: nothing blocks the want, so there is no story pressure.');
  if (!present.turn) reasons.push('TURN_MISSING: the situation never changes.');

  return { pass: reasons.length === 0, reasons, present };
}
