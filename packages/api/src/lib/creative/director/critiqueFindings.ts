/**
 * Critique findings → director suggestions (2026-11-17).
 *
 * The critique already runs on the chapter the creator is reading. This turns its **weakest** dimension into a
 * `reviewFinding`, which `buildDirectorSuggestions` already accepts — no second generator, one input path.
 *
 * THE MAPPING IS A DECISION, NOT AN INFERENCE. The axis set is pacing / framing / lighting / tone (plus
 * unclassified), defined in #430, and the critique's three dimensions do not all belong to it:
 *
 *  - **pacing → pacing.** The same concept at a different scale: how fast the story moves.
 *  - **sensory grounding → framing.** Framing is what the camera includes; sensory grounding is whether anything
 *    concrete is shown at all. Same question one level up, and the direction is `more` (show more, not less).
 *  - **voice → unclassified.** Voice consistency has **no counterpart** in the four axes. It is craft consistency —
 *    person and tense not drifting — not a taste dimension. Calling it `tone` would teach the profile that a
 *    creator whose narration drifts likes a particular emotional register, which is not what they said.
 *
 * Using `unclassified` honestly matters more than filling the bucket: a suggestion that arrives with a wrong axis
 * teaches the profile the wrong thing, and a bucket padded with mislabelled signals is worse than one that admits
 * a dimension is outside the vocabulary.
 */
import type { StoryCritique } from '../../story/storyCritique';

export interface CritiqueFinding {
  category: string;
  description: string;
  suggestedFixInstruction: string;
}

/** The axis each critique dimension belongs to, or null where it is honestly outside the set. */
export const CRITIQUE_DIMENSION_AXES: Record<'sensory' | 'pacing' | 'voice', 'framing' | 'pacing' | null> = {
  sensory: 'framing',
  pacing: 'pacing',
  voice: null,
};

/** Below this a dimension is worth acting on; the surface uses the same line (2026-11-17). */
export const CRITIQUE_ACTIONABLE_BELOW = 70;

/**
 * The single weakest dimension as a director finding, or null when the chapter is fine.
 *
 * Returns at most ONE: the lowest is the one thing a creator can fix, and a list of three corrections is the
 * three-numbers problem in a different shape.
 */
export function critiqueFinding(critique: StoryCritique | null | undefined): CritiqueFinding | null {
  if (!critique || critique.tooShort) return null;

  const dimensions = [
    { key: 'sensory' as const, ...critique.sensory },
    { key: 'pacing' as const, ...critique.pacing },
    { key: 'voice' as const, ...critique.voice },
  ];
  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  if (!weakest || weakest.score >= CRITIQUE_ACTIONABLE_BELOW) return null;

  const axis = CRITIQUE_DIMENSION_AXES[weakest.key];
  // The instruction is what the creator reads, and it carries no number: a score is a measurement, the sentence is
  // the action. The axis, when there is one, is what lets the acceptance teach the profile.
  return {
    category: axis ?? 'unclassified',
    description: weakest.lowScoreMeaning,
    suggestedFixInstruction: `Strengthen this chapter's ${weakest.key === 'sensory' ? 'sensory grounding' : weakest.key}: ${weakest.lowScoreMeaning}`,
  };
}
