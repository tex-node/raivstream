/**
 * Operational patterns §1.4 — Redis-backed request rate limiting.
 *
 * One shared Redis state across every process (web today, export worker next),
 * so limits cannot fragment between processes and they survive restarts. There
 * is deliberately **no in-memory fallback**: a silent fallback is how the old
 * `apps/web/src/lib/rateLimit.ts` shipped per-process limits that did not hold
 * across restarts or processes. If the env vars are missing, `getRedis()` throws
 * at the first check — loud, not degraded.
 *
 * ── Window algorithm ────────────────────────────────────────────────────────
 * Two adjacent fixed windows, weighted by how far we are into the current one:
 *
 *     weighted = previous * ((windowMs - elapsed) / windowMs) + current
 *
 * This approximates a true sliding window without sorted sets, and is the
 * standard Upstash pattern: two INCRs plus a GET in one pipeline. Under a race a
 * request may be counted twice (acceptable); a request that should be allowed is
 * never rejected on the boundary.
 */

import { Redis } from '@upstash/redis';

export type BucketName =
  | 'auth'
  | 'authBurst'
  | 'unauth'
  | 'unauthBurst'
  | 'expensive'
  | 'expensiveBurst'
  | 'admin'
  | 'authLogin'
  | 'authRegister'
  | 'authRefresh'
  | 'authGoogleLogin';

export interface BucketConfig {
  windowMs: number;
  max: number;
}

export const BUCKETS: Record<BucketName, BucketConfig> = {
  auth:            { windowMs: 60_000,  max: 60 },
  authBurst:       { windowMs: 10_000,  max: 20 },
  unauth:          { windowMs: 60_000,  max: 120 },
  unauthBurst:     { windowMs: 10_000,  max: 30 },
  expensive:       { windowMs: 60_000,  max: 10 },
  expensiveBurst:  { windowMs: 10_000,  max: 3 },
  admin:           { windowMs: 60_000,  max: 200 },
  // Auth routes keep their original long windows (5/3/30/10 per 15 min).
  authLogin:       { windowMs: 900_000, max: 5 },
  authRegister:    { windowMs: 900_000, max: 3 },
  authRefresh:     { windowMs: 900_000, max: 30 },
  authGoogleLogin: { windowMs: 900_000, max: 10 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** 0 when allowed. */
  retryAfterMs: number;
  bucket: BucketName;
}

let client: Redis | null = null;

/** Lazy singleton — no connection at import time. Throws loudly if unconfigured. */
function getRedis(): Redis {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_URL;
    const token = process.env.UPSTASH_REDIS_TOKEN;
    if (!url || !token) {
      throw new Error(
        'Rate limiting requires UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN. '
        + 'They belong in apps/web/.env.local (the file PM2 sources), not the root .env.',
      );
    }
    client = new Redis({ url, token });
  }
  return client;
}

/** Test seam — inject a fake client (see rateLimit.test.ts). */
export function __setRateLimitRedisForTests(fake: unknown): void {
  client = fake as Redis | null;
}

/**
 * Count one request against `key`/`bucketName` and decide.
 *
 * Throws if Redis is unreachable or unconfigured — callers must not treat that
 * as "allowed".
 */
export async function checkLimit(key: string, bucketName: BucketName): Promise<RateLimitResult> {
  const bucket = BUCKETS[bucketName];
  const redis = getRedis();

  const now = Date.now();
  const windowIndex = Math.floor(now / bucket.windowMs);
  const elapsedMs = now - windowIndex * bucket.windowMs;
  const currentKey = `rl:${key}:${bucketName}:${windowIndex}`;
  const previousKey = `rl:${key}:${bucketName}:${windowIndex - 1}`;

  const pipeline = redis.pipeline();
  pipeline.incr(currentKey);
  // TTL >= 2 windows so the previous window is still readable for weighting.
  pipeline.expire(currentKey, Math.ceil((bucket.windowMs * 2) / 1000));
  pipeline.get(previousKey);
  const raw = (await pipeline.exec()) as unknown as Array<[unknown, unknown]>;

  const currentCount = Number(raw[0]?.[1] ?? 0);
  const previousCount = Number(raw[2]?.[1] ?? 0);
  const previousWeight = (bucket.windowMs - elapsedMs) / bucket.windowMs;
  const weighted = previousCount * previousWeight + currentCount;

  const allowed = weighted <= bucket.max;
  return {
    allowed,
    remaining: Math.max(0, Math.floor(bucket.max - weighted)),
    retryAfterMs: allowed ? 0 : bucket.windowMs - elapsedMs,
    bucket: bucketName,
  };
}
