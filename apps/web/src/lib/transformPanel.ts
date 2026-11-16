/**
 * Transformation surface logic (2026-11-16).
 *
 * Kept out of the component so the three things that must be right — the cost copy, the timeout copy, and the
 * no-change rule — are testable without rendering.
 *
 * The measured facts behind the copy:
 *  - a 3 s relight and a 3 s restyle both took **72.8–95.3 s** end to end, so progress must be visible from the
 *    first second and the 10-minute cap must surface;
 *  - the same restyle endpoint scored **styleChange 15** on a balanced grade and **85** on a blunt one, so an
 *    instruction that asks for a tasteful improvement is a no-change outcome waiting to happen;
 *  - the charge is refunded when the render fails, so a timeout that says "nothing was charged" is true.
 */

export const TRANSFORM_TIMEOUT_MS = 10 * 60 * 1000;

export type TransformOperation = 'relight' | 'restyle';

/** The instruction guidance is derived from a measured pair (15 vs 85), not from taste. */
export function instructionGuidance(operation: TransformOperation): string {
  return operation === 'relight'
    ? 'Name the lighting directly: "hard key light from the left, deep shadows, cool rim light" works better than "make it moodier".'
    : 'Name the look directly: "monochrome, crushed blacks, single hard key light" works better than "make it more cinematic".';
}

export function instructionPlaceholder(operation: TransformOperation): string {
  return operation === 'relight'
    ? 'Hard key light from the left, deep shadows, cool rim light…'
    : 'Monochrome noir, crushed blacks, high-contrast grade…';
}

/** A restyle that looks unchanged is a no-change outcome, not a success — the surface says so. */
export function noChangeCaveat(operation: TransformOperation): string | null {
  return operation === 'restyle'
    ? 'Compare the result against the source. If the look barely moved, that is a no-change outcome: the instruction was too subtle, not the asset.'
    : null;
}

export function formatTransformCost(quote: { credits: number; billedSeconds: number } | undefined): string {
  if (!quote) return 'Checking price…';
  return `${quote.credits.toLocaleString()} credits · ${quote.billedSeconds}s billed`;
}

export function elapsedLabel(startedAtMs: number | null, nowMs: number): string | null {
  if (startedAtMs === null) return null;
  const seconds = Math.max(0, Math.round((nowMs - startedAtMs) / 1000));
  if (seconds < 60) return `Working… ${seconds}s`;
  return `Working… ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function timedOut(startedAtMs: number | null, nowMs: number): boolean {
  return startedAtMs !== null && nowMs - startedAtMs >= TRANSFORM_TIMEOUT_MS;
}

/** A surfaced timeout is a failure that says nothing was charged — never a hang. */
export function timeoutCopy(): string {
  return 'This took too long. Nothing was charged — the transformation refunds itself when the render does not finish.';
}

/** Creator-facing language for each typed refusal, so no code string reaches a creator. */
export function transformErrorCopy(message: string | undefined): string {
  const value = String(message ?? '');
  if (value.includes('TRANSFORM_DURATION_REQUIRED') || /no recorded duration/i.test(value)) {
    return 'This asset has no recorded duration yet, so it cannot be priced. Try again once it has been measured.';
  }
  if (value.includes('TRANSFORM_RATE_MISSING') || /no relight rate|no restyle rate/i.test(value)) {
    return 'This transformation has no price configured at that resolution yet.';
  }
  if (value.includes('TRANSFORM_ENDPOINT_CONTRACT_UNVERIFIED') || /endpoint is not configured/i.test(value)) {
    return 'This transformation is not available yet.';
  }
  if (value.includes('TRANSFORM_BODY_INVALID')) {
    return 'That instruction is not valid for this transformation.';
  }
  return 'The transformation could not be started. Nothing was charged.';
}

export function provenanceLine(producedBy: string | null | undefined, sourceAssetId: string | null | undefined): string {
  return `Produced by ${producedBy ?? 'unknown'} from ${sourceAssetId ?? 'unknown source'}`;
}
