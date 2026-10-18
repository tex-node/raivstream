/**
 * Operational patterns §1.4 — what bucket a request falls into, and enforcing it.
 *
 * Deliberately free of any dependency on the tRPC builder (`t`): `trpc.ts`
 * imports this module, so importing `t` back would create a cycle. The thin
 * `.use(...)` wrapper lives in trpc.ts; everything testable lives here.
 */

import { TRPCError } from '@trpc/server';
import { checkLimit, type BucketName } from './rateLimit';
import { isExpensive } from './expensiveProcedures';

export interface RateLimitSubject {
  /** Full procedure path, e.g. `generation.create`. */
  path: string;
  user: { id: string; role: string } | null;
  userId: string | null;
  ip: string | null;
}

const ADMIN_ROLES = new Set(['ADMIN', 'MODERATOR']);

/** The bucket every request in this tier must satisfy first. */
export function pickPrimaryBucket(subject: RateLimitSubject): BucketName {
  if (!subject.user) return 'unauth';
  if (ADMIN_ROLES.has(subject.user.role)) return 'admin';
  return 'auth';
}

/** The short-window burst companion for a primary bucket (none for admin). */
export function burstBucketFor(primary: BucketName): BucketName | null {
  switch (primary) {
    case 'auth': return 'authBurst';
    case 'unauth': return 'unauthBurst';
    case 'expensive': return 'expensiveBurst';
    default: return null;
  }
}

export function buildRateLimitKey(subject: RateLimitSubject): string {
  if (subject.userId) return `user:${subject.userId}`;
  return `ip:${subject.ip ?? 'unknown'}`;
}

let warnedMissingIp = false;

function reject(bucket: BucketName, retryAfterMs: number): never {
  console.warn(`[ratelimit] exceeded bucket=${bucket} retryAfterMs=${retryAfterMs}`);
  throw new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message: `Rate limit exceeded (${bucket}). Retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
    cause: { bucket, retryAfterMs },
  });
}

/**
 * Enforce every applicable bucket for one request. Throws `TOO_MANY_REQUESTS`
 * with `{ bucket, retryAfterMs }` on the error cause.
 *
 * Every request increments — including successful ones. The limit is
 * per-request, not per-failure.
 */
export async function enforceRateLimit(subject: RateLimitSubject): Promise<void> {
  if (!subject.user && !subject.ip && !warnedMissingIp) {
    warnedMissingIp = true;
    console.warn('[ratelimit] ip_missing — unauthenticated requests fall back to ip:unknown');
  }

  const primary = pickPrimaryBucket(subject);

  const primaryResult = await checkLimit(buildRateLimitKey(subject), primary);
  if (!primaryResult.allowed) reject(primary, primaryResult.retryAfterMs);

  const burst = burstBucketFor(primary);
  if (burst) {
    const burstResult = await checkLimit(buildRateLimitKey(subject), burst);
    if (!burstResult.allowed) reject(burst, burstResult.retryAfterMs);
  }

  // Expensive work gets its own long + burst budget on top of the tier budget.
  if (subject.user && primary !== 'admin' && isExpensive(subject.path)) {
    const expensive = await checkLimit(buildRateLimitKey(subject), 'expensive');
    if (!expensive.allowed) reject('expensive', expensive.retryAfterMs);

    const expensiveBurst = await checkLimit(buildRateLimitKey(subject), 'expensiveBurst');
    if (!expensiveBurst.allowed) reject('expensiveBurst', expensiveBurst.retryAfterMs);
  }
}

/** Test seam. */
export function __resetRateLimitWarningForTests(): void {
  warnedMissingIp = false;
}
