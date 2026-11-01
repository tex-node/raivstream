import { createHash } from 'node:crypto';

/**
 * Phase 2 piece (2) — take numbering, idempotency and conflict rules.
 *
 * These are pure functions on purpose: the mutation that uses them charges
 * credits, so the parts that can be decided without a database are decided
 * (and tested) here rather than inline in the router.
 */

/** A retry inside this window is the same intent; a retry after it is a new one. */
export const TAKE_IDEMPOTENCY_BUCKET_MS = 60_000;

/**
 * Derive a stable key when the client does not supply one.
 *
 * BUCKET DECISION (deliberate, not emergent): the key includes
 * `floor(now / 60s)`, so
 *   - a retry at +30 s lands in the same bucket and returns the existing take;
 *   - a retry at +90 s lands in the next bucket and creates a new take.
 *
 * The second behaviour is a product decision: a minute later is a new intent, not
 * a duplicate. If that is ever wrong, change the bucket width here or require the
 * client to supply the key — do not leave it to be discovered.
 *
 * A key that changed on every request would be no key at all; a key that never
 * changed would make every regeneration a duplicate. Both failure modes are
 * excluded by the bucket.
 */
export function deriveTakeIdempotencyKey(input: {
  sceneId: string;
  prompt: string;
  expectedTakeNumber?: number | null;
  now: number;
  bucketMs?: number;
}): string {
  const bucketMs = input.bucketMs ?? TAKE_IDEMPOTENCY_BUCKET_MS;
  const bucket = Math.floor(input.now / bucketMs);
  return createHash('sha256')
    .update(
      [
        input.sceneId,
        input.prompt,
        input.expectedTakeNumber ?? 'any',
        String(bucket),
      ].join('|'),
    )
    .digest('hex');
}

/** The next take for a scene: max+1 (the SequenceVersion pattern). */
export function nextTakeNumber(latestTakeNumber: number | null | undefined): number {
  return (latestTakeNumber ?? 0) + 1;
}

/**
 * Two unique constraints guard this path, and they mean different things.
 *
 * - `(sceneId, idempotencyKey)` — a duplicate request. Recovery: return the
 *   existing take. It is not an error.
 * - `(sceneId, takeNumber)` — a lost race: another writer inserted take N between
 *   our read and our write. Recovery: re-read and retry once with N+1. Treating it
 *   as a conflict would fail a request that should have succeeded.
 */
export type TakeUniqueViolation = 'idempotencyKey' | 'takeNumber' | null;

export function classifyTakeUniqueViolation(error: unknown): TakeUniqueViolation {
  const code = (error as { code?: string } | null)?.code;
  if (code !== 'P2002') return null;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  if (fields.some((f) => f.includes('idempotencyKey'))) return 'idempotencyKey';
  if (fields.some((f) => f.includes('takeNumber'))) return 'takeNumber';
  return null;
}

/**
 * A client that thinks the scene is on take N must not silently overwrite take N+1.
 * Returns the payload for the typed conflict, or null when the request is fresh.
 */
export function staleTakeConflict(input: {
  expectedTakeNumber?: number | null;
  currentTakeNumber: number | null | undefined;
}): { currentTakeNumber: number } | null {
  if (input.expectedTakeNumber == null) return null;
  const current = input.currentTakeNumber ?? 0;
  return current > input.expectedTakeNumber ? { currentTakeNumber: current } : null;
}
