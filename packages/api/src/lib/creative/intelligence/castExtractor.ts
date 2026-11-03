/**
 * LLM cast extractor (2026-11-03).
 *
 * `deriveCast()` splits English on "and"/commas and returns fragments - measured, it
 * produced `Confrontin` and `Lagos Street Musician Who Finds A Lost Violin` from real ideas.
 * The text it needed was never missing: 37 of 39 flagged projects carry the creator's own
 * words in `CreativeBrief.originalIntent`.
 *
 * This reads that text with a model and returns the SAME shape the cast stage already
 * consumes, so nothing downstream needs to know which extractor produced a cast.
 */
import { MAX_CAST, deriveCast, type DerivedCharacter } from './service';
import type { CreativeInterpretation } from '../shared/types';

export interface CastExtractionDeps {
  /** Returns the model's raw text, or null when no model is configured. */
  complete?: (prompt: string) => Promise<string | null>;
}

const SYSTEM = [
  'You extract the cast of a short film from its idea.',
  `Return AT MOST ${MAX_CAST} characters. Fewer is better than invented.`,
  'Each character needs a "name" and a "visualDescription" with concrete detail a ',
  'storyboard artist could draw (build, clothing, distinguishing features, palette).',
  'If the idea names no character, return an empty array - never invent one.',
  'Return JSON only: {"characters":[{"name":"…","visualDescription":"…"}]}',
].join(' ');

export function buildCastPrompt(idea: string): string {
  return `${SYSTEM}\n\nIDEA:\n${idea}`;
}

/** Parse the model's reply defensively; anything unusable returns null so the caller can fall back. */
export function parseCastResponse(raw: string): DerivedCharacter[] | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const candidates = (parsed as { characters?: unknown }).characters;
  if (!Array.isArray(candidates)) return null;

  const cast: DerivedCharacter[] = [];
  for (const entry of candidates) {
    const name = typeof (entry as { name?: unknown })?.name === 'string' ? (entry as { name: string }).name.trim() : '';
    const description = typeof (entry as { visualDescription?: unknown })?.visualDescription === 'string'
      ? (entry as { visualDescription: string }).visualDescription.trim()
      : '';
    // Both fields are required: a name without a description is exactly what made
    // deriveCast()'s output useless for reference generation.
    if (!name || description.length < 8) continue;
    cast.push({ name, visualDescription: description, source: 'explicit-subject' });
    if (cast.length >= MAX_CAST) break;
  }
  return cast;
}

/**
 * Extract a cast from the creator's own words.
 *
 * Fails open to `deriveCast()` when no model is configured or the reply is unusable - a
 * worse cast beats a blocked pipeline, and the caller can see which path ran.
 */
export async function extractCastWithLLM(
  idea: string,
  deps: CastExtractionDeps = {},
): Promise<{ cast: DerivedCharacter[]; via: 'llm' | 'fallback' }> {
  const fallback = (): { cast: DerivedCharacter[]; via: 'fallback' } => ({
    cast: deriveCast({ projectType: 'STORY', explicit: { subject: idea }, inferred: {}, summary: '', uncertain: [], questions: [] } as unknown as CreativeInterpretation),
    via: 'fallback',
  });
  if (!deps.complete) return fallback();
  try {
    const raw = await deps.complete(buildCastPrompt(idea));
    if (!raw) return fallback();
    const parsed = parseCastResponse(raw);
    // An EMPTY array is a valid answer, not a parse failure. 28 of the 39 flagged projects
    // are commercials, lessons and promos: "no characters" is correct for them, and routing
    // that answer to the fallback replaced it with a splitter that invents fragments
    // (`Confrontin`). Only a genuinely unparseable reply falls back.
    if (parsed === null) return fallback();
    return { cast: parsed, via: 'llm' };
  } catch {
    return fallback();
  }
}

/**
 * Project types where `characterIdentity` is meaningful.
 *
 * A perfume commercial has no characters, so scoring it on character consistency is a
 * category error, not a quality signal. This predicate scopes the dimension to formats
 * that can contain a character.
 */
export const NARRATIVE_PROJECT_TYPES = ['STORY', 'DRAMA', 'NARRATIVE'] as const;

export function gateIncludesCharacterIdentity(projectType: string | null | undefined): boolean {
  if (!projectType) return true; // unknown stays in scope: never silently skip a gate
  return (NARRATIVE_PROJECT_TYPES as readonly string[]).includes(projectType);
}
