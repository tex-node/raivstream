/**
 * Admin credit adjustments are explicit one-off actions: each submit is a distinct
 * intent, so the idempotency id must be FRESH per submit — never input-coupled.
 * Two identical grants (same user/amount/action/reason) are a legitimate pair, not
 * a replay. The only duplicate this defends against is a double-click, which the
 * disabled submit button (and {@link shouldSubmitAdjustment}) prevents.
 */

/** A fresh idempotency id for one admin adjustment. */
export function newAdjustmentId(): string {
  return crypto.randomUUID();
}

/** True when an adjustment may be submitted (not already in flight). */
export function shouldSubmitAdjustment(isPending: boolean): boolean {
  return !isPending;
}
