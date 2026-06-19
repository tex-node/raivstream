/**
 * IP-based sliding window rate limiter.
 *
 * Uses Upstash Redis when UPSTASH_REDIS_URL is set (multi-server deployments).
 * Falls back to an in-memory Map (single-server / local dev).
 *
 * Usage:
 *   const result = await rateLimit('login', ip, { max: 5, windowSec: 900 });
 *   if (!result.success) return rateLimitResponse(result);
 */

// ─── In-memory store (fallback) ───────────────────────────────────────────────

interface Bucket {
  count:   number;
  resetAt: number; // unix ms
}

const memoryStore = new Map<string, Bucket>();

// Clean up expired buckets periodically to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of memoryStore) {
      if (bucket.resetAt < now) memoryStore.delete(key);
    }
  }, 60_000);
}

function memoryCheck(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || existing.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: max - 1, resetAt: now + windowMs, limit: max };
  }

  existing.count += 1;
  return {
    success:   existing.count <= max,
    remaining: Math.max(0, max - existing.count),
    resetAt:   existing.resetAt,
    limit:     max,
  };
}

// ─── Upstash Redis (production multi-server) ──────────────────────────────────

async function redisCheck(key: string, max: number, windowSec: number): Promise<RateLimitResult> {
  // @upstash/redis is an optional dep — install with: pnpm add @upstash/redis --filter web
  // webpackIgnore prevents the build from failing when the package is not installed.
  const { Redis } = require(/* webpackIgnore: true */ '@upstash/redis') as any;
  const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_URL!,
    token: process.env.UPSTASH_REDIS_TOKEN!,
  });

  const now     = Date.now();
  const resetAt = now + windowSec * 1000;

  const [[, count]] = await redis.pipeline()
    .incr(key)
    .expire(key, windowSec)
    .exec() as [[null, number], [null, number]];

  return {
    success:   (count as number) <= max,
    remaining: Math.max(0, max - (count as number)),
    resetAt,
    limit:     max,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success:   boolean;
  remaining: number;
  resetAt:   number; // unix ms
  limit:     number;
}

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  max:       number;
  /** Window size in seconds */
  windowSec: number;
}

/**
 * Check the rate limit for a given action and IP address.
 *
 * @param action   Logical namespace (e.g. 'login', 'register')
 * @param ip       Client IP address
 * @param config   Limit configuration
 */
export async function rateLimit(
  action: string,
  ip:     string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = `rl:${action}:${ip}`;

  if (process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN) {
    try {
      return await redisCheck(key, config.max, config.windowSec);
    } catch {
      // Redis unavailable — fall through to memory store
    }
  }

  return memoryCheck(key, config.max, config.windowSec * 1000);
}

/** Extract the real client IP from a Next.js Request */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

/** Build a 429 Too Many Requests response with Retry-After header */
export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
  return new Response(
    JSON.stringify({ error: 'Too many requests — please try again later' }),
    {
      status: 429,
      headers: {
        'Content-Type':  'application/json',
        'Retry-After':   String(retryAfterSec),
        'X-RateLimit-Limit':     String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset':     String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}
