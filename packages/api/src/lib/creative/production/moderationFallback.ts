/**
 * Moderation fallback (2026-11-06).
 *
 * A single rejected still deleted a whole scene: the image failed for graphic violence and the
 * video then failed for want of a seed. The film came out a scene short with no record of why.
 *
 * The shape is retry-then-drop, in that order:
 *   1. one softened retry, using the existing `suggestSafeRewrite` mechanism;
 *   2. if that is rejected too, the scene is DROPPED - recorded, not silently omitted - and the run
 *      completes with a documented gap.
 *
 * Pure functions here; the runner applies them.
 */

export type RejectionAction =
  | { action: 'retry'; prompt: string }
  | { action: 'drop'; reason: string };

export function decideAfterRejection(input: {
  alreadyRetried: boolean;
  originalPrompt: string;
  rewritten: string | null | undefined;
}): RejectionAction {
  const rewritten = typeof input.rewritten === 'string' ? input.rewritten.trim() : '';
  // A rewrite identical to the original is not a retry: it would be rejected again for the same
  // reason and cost the creator a second charge to learn nothing.
  if (!input.alreadyRetried && rewritten.length > 0 && rewritten !== input.originalPrompt.trim()) {
    return { action: 'retry', prompt: rewritten };
  }
  return {
    action: 'drop',
    reason: input.alreadyRetried ? 'SCENE_DROPPED moderation_rejected_after_retry' : 'SCENE_DROPPED moderation_rejected',
  };
}

/**
 * Net spend after a refund.
 *
 * A refunded charge must not count against the ceiling: a run that retries after a rejection would
 * otherwise exhaust its budget on money that was returned. `creditsSpent` is therefore NET, and the
 * cap is checked against net.
 */
export function netSpendAfterRefund(spent: number, refunded: number): number {
  if (!Number.isFinite(spent) || !Number.isFinite(refunded)) return spent;
  return Math.max(0, spent - refunded);
}

/** Can a scene seed a video? A dropped scene cannot, so its video is skipped rather than failed blind. */
export function canSeedVideo(input: { sceneDropped: boolean; stillReady: boolean }): boolean {
  return !input.sceneDropped && input.stillReady;
}

/** The drop record names the asset kind, so "scene dropped" can be told from "its video dropped". */
export function dropReason(kind: 'IMAGE' | 'VIDEO'): string {
  return `SCENE_DROPPED moderation_rejected kind=${kind}`;
}

/**
 * Propagate a still's softened rewrite to the same scene's video (2026-11-06).
 *
 * The video prompt is built from the same scene text as the still, so softening the still alone
 * left the video carrying the phrase that was just rejected - which is exactly what happened:
 * SCENE_01's and SCENE_02's videos were flagged for the phrase "finds an injured bird" after their
 * stills had passed.
 */
export function applySoftenedPrompt(
  prompt: string,
  rewrite: { original: string; softened: string } | undefined,
): string {
  if (!rewrite) return prompt;
  const original = rewrite.original.trim();
  const softened = rewrite.softened.trim();
  if (!original || !softened || original === softened) return prompt;
  return prompt.includes(original) ? prompt.split(original).join(softened) : prompt;
}
