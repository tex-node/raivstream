/**
 * Which critique line a creator sees (2026-11-17).
 *
 * Kept pure and out of the component so the rule is testable without rendering: the DEFAULT is the lowest
 * dimension WITH ITS SENTENCE — one actionable thing. Three numbers would be the aggregate defect in a new place:
 * `sensory: 0` is a measurement, "told in summary rather than images — add light, sound, texture and physical
 * action" is the thing a creator can act on.
 *
 * A chapter that scores well on all three shows NOTHING. Three high numbers nobody needs is noise, and a
 * permanent green tick is a verdict where a quiet line should be.
 */

export type CritiqueKey = 'sensory' | 'pacing' | 'voice';

export interface CritiqueDimensionView {
  key: CritiqueKey;
  score: number;
  lowScoreMeaning: string;
  measuredBy: string;
}

export interface CritiquePayload {
  dimensions: CritiqueDimensionView[];
  lowest: CritiqueDimensionView | null;
  tooShort: boolean;
}

/** Below this a dimension is worth mentioning; at or above it the chapter passes quietly. */
export const CRITIQUE_MENTION_BELOW = 70;

export function visibleCritique(payload: CritiquePayload | null | undefined): CritiqueDimensionView | null {
  if (!payload || payload.tooShort || !payload.lowest) return null;
  return payload.lowest.score < CRITIQUE_MENTION_BELOW ? payload.lowest : null;
}

export function dimensionLabel(key: CritiqueKey): string {
  return key === 'sensory' ? 'Sensory grounding' : key === 'pacing' ? 'Pacing' : 'Voice consistency';
}

/** An observation, never a verdict: "this chapter is told in summary", never "your writing is poor". */
export function critiqueLine(dimension: CritiqueDimensionView): string {
  return `${dimensionLabel(dimension.key)} is low — this chapter is ${lowerFirst(dimension.lowScoreMeaning)}`;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function expandedCritique(payload: CritiquePayload | null | undefined): CritiqueDimensionView[] {
  if (!payload || payload.tooShort) return [];
  return payload.dimensions;
}
