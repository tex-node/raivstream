import type { ModerationResult } from '../../promptModeration';

/**
 * Pre-flight moderation (2026-11-06).
 *
 * Moderation is free; generation is not. Checking the composed prompt **before the charge** turns a
 * paid rejection into a free refusal, and a prompt that can pass can be made to pass before any
 * money is spent.
 *
 * The free hypothesis test that motivated this: SCENE_01's still was allowed while its video was
 * flagged for the same scene text - the video adds motion and camera lines, and the combination
 * crosses the filter. A pre-flight sees that for nothing.
 */

export type PreflightDecision =
  | { action: 'pass' }
  | { action: 'softened'; prompt: string }
  | { action: 'refuse'; reason: string; flaggedPhrase: string | null };

export class PreflightRefusedError extends Error {
  readonly code = 'PREFLIGHT_REFUSED';
  constructor(
    readonly kind: string,
    readonly reason: string,
    readonly flaggedPhrase: string | null,
  ) {
    super(`Pre-flight moderation refused this ${kind}: ${reason}${flaggedPhrase ? ` (flagged: ${flaggedPhrase})` : ''}`);
    this.name = 'PreflightRefusedError';
  }
}

/**
 * Decide what a pre-flight result means. A rejected prompt gets ONE rewrite attempt, re-checked by
 * the caller; the decision here only says whether a rewrite is worth trying.
 */
export function preflightDecision(input: {
  initial: ModerationResult;
  rewritten: string | null | undefined;
  alreadySoftened: boolean;
}): PreflightDecision {
  if (input.initial.allowed) return { action: 'pass' };

  const rewritten = typeof input.rewritten === 'string' ? input.rewritten.trim() : '';
  if (!input.alreadySoftened && rewritten.length > 0) {
    return { action: 'softened', prompt: rewritten };
  }

  return {
    action: 'refuse',
    reason: input.initial.reason ?? 'flagged',
    flaggedPhrase: input.initial.flaggedPhrase ?? null,
  };
}

/** The asset-level record of a free refusal. No prompt text: the phrase is content, the code is not. */
export function preflightRecord(kind: string, reason: string): string {
  return `PREFLIGHT_REFUSED kind=${kind} reason=${reason}`;
}
