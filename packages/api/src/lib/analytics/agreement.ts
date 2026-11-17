/**
 * Agreement — did the creator's edit move the way the suggestion they accepted said it would? (2026-11-17)
 *
 * The profile's last missing input. Direction comes from the **accepted suggestion's mapping** (axis + direction); the
 * evidence comes from the **critique's score before and after the edit**. Lengths could never do this: a longer
 * paragraph is not "more pacing".
 *
 * STORE THE MEASUREMENTS, DERIVE THE JUDGEMENT. The two critique scores are stored on the events; the verdict is
 * computed at read time. A scorer change then recomputes agreement from raw measurements instead of trusting a stale
 * conclusion — the `durationSeconds` lesson applied to a second surface.
 *
 * WHAT THIS CANNOT DO, and does not pretend to: **voice has no direction**. Its score is a dominance *margin*, so
 * "first person dominant → evenly split" is a smaller number and is not "less voice". Voice edits are therefore
 * `no-direction` rather than agreement or disagreement — forcing a verdict there would teach the profile noise.
 */
import type { StyleAxis } from './styleAxes';
import type { SuggestionDirection } from './suggestionDirection';

/**
 * How long after an acceptance an edit still counts as attributable. **Minutes, not seconds:** a creator accepts a
 * suggestion, reads the paragraph, thinks, then edits. Too short and genuine edits are missed; too long and an
 * unrelated edit is blamed on a stale suggestion.
 */
export const ATTRIBUTION_WINDOW_MS = 15 * 60 * 1000;

/** The dimensions that can carry a direction at all. Voice is deliberately absent. */
export const DIRECTIONAL_DIMENSIONS = ['sensory', 'pacing'] as const;
export type DirectionalDimension = (typeof DIRECTIONAL_DIMENSIONS)[number];

export interface CriticizeScores {
  sensory?: number;
  pacing?: number;
  voice?: number;
}

export interface SuggestionAcceptance {
  userId: string;
  chapterId: string;
  axis: StyleAxis;
  direction: SuggestionDirection;
  acceptedAt: number;
  /**
   * The critique of the chapter BEFORE the edit. In practice it is read off the edit event's `critiqueBefore`, which
   * is computed from the stored prior body at edit time — exact, and never reconstructed from a stored guess.
   */
  scoresBefore: CriticizeScores;
}

export interface ChapterEdit {
  userId: string;
  chapterId: string;
  editedAt: number;
  /** The critique of the chapter AFTER the edit. */
  scoresAfter: CriticizeScores;
}

export type AgreementVerdict = 'agreement' | 'disagreement' | 'no-change' | 'no-direction';

export interface AgreementResult {
  verdict: AgreementVerdict;
  dimension: DirectionalDimension | null;
  /** The measurement the verdict rests on, kept so a reader can disagree with the conclusion. */
  before: number | null;
  after: number | null;
}

/** Which critique dimension a mapped axis speaks to. `framing` is served by sensory grounding (see #435). */
const AXIS_TO_DIMENSION: Partial<Record<StyleAxis, DirectionalDimension>> = {
  pacing: 'pacing',
  framing: 'sensory',
};

/**
 * The nearest acceptance that could own this edit, or null when the edit is not attributable.
 *
 * Scoped by **user and chapter**: an edit to a different chapter is never attributed to the wrong suggestion, and one
 * acceptance never owns two edits (the caller passes the acceptances not yet consumed).
 */
export function attributeEdit(
  edit: ChapterEdit,
  acceptances: SuggestionAcceptance[],
): SuggestionAcceptance | null {
  const candidates = acceptances
    .filter((acceptance) => acceptance.userId === edit.userId && acceptance.chapterId === edit.chapterId)
    .filter((acceptance) => {
      const delta = edit.editedAt - acceptance.acceptedAt;
      return delta >= 0 && delta <= ATTRIBUTION_WINDOW_MS;
    })
    .sort((a, b) => b.acceptedAt - a.acceptedAt);
  return candidates[0] ?? null;
}

/**
 * The verdict. `null` acceptance means the edit is not attributable and must be **ignored**, not counted as
 * disagreement — an edit with no preceding acceptance says nothing about agreement.
 */
export function agreementFor(acceptance: SuggestionAcceptance | null, edit: ChapterEdit): AgreementResult | null {
  if (!acceptance) return null;

  const dimension = AXIS_TO_DIMENSION[acceptance.axis] ?? null;
  if (!dimension || acceptance.direction === null) {
    return { verdict: 'no-direction', dimension: null, before: null, after: null };
  }
  if (acceptance.direction === 'different') {
    // "A different ending" is not a directional claim about a score; there is nothing to move toward.
    return { verdict: 'no-direction', dimension, before: null, after: null };
  }

  const before = acceptance.scoresBefore[dimension] ?? null;
  const after = edit.scoresAfter[dimension] ?? null;
  if (before === null || after === null) {
    return { verdict: 'no-direction', dimension, before, after };
  }

  if (after === before) return { verdict: 'no-change', dimension, before, after };
  const moved = after > before;
  const wanted = acceptance.direction === 'more';
  return { verdict: moved === wanted ? 'agreement' : 'disagreement', dimension, before, after };
}
