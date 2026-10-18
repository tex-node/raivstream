/**
 * Route-level rate limiting for the credential endpoints.
 *
 * Thin adapter over the shared Redis limiter in `@raivstream/api`: one state for
 * every process, so limits hold across restarts and — once the export worker
 * exists — across processes. The previous in-memory `Map` fallback was deleted:
 * it silently degraded to per-process limits, which is worse than failing.
 *
 * If Redis is unconfigured, `checkLimit` throws at the first call rather than
 * allowing unlimited traffic.
 */

import { BUCKETS, checkLimit, type BucketName } from '@raivstream/api/src/lib/resilience/rateLimit';

/** Buckets this adapter is allowed to use (long-window credential limits). */
const ROUTE_BUCKETS: ReadonlySet<BucketName> = new Set<BucketName>([
  'authLogin',
  'authRegister',
  'authRefresh',
  'authGoogleLogin',
]);

/** Extract the real client IP from a Next.js Request. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

/**
 * Check the bucket for this request. Returns a 429 `Response` when the caller is
 * over the limit, or `null` to continue.
 */
export async function rateLimitRoute(req: Request, bucket: BucketName): Promise<Response | null> {
  if (!ROUTE_BUCKETS.has(bucket)) {
    throw new Error(`rateLimitRoute does not accept bucket "${bucket}"`);
  }

  const ip = getClientIp(req);
  const result = await checkLimit(`ip:${ip}`, bucket);
  if (result.allowed) return null;

  // Credential endpoints are the most abuse-relevant surface, so a hit is
  // logged here; the tRPC middleware logs its own rejections.
  console.warn(`[ratelimit] exceeded bucket=${bucket} key=ip:${ip} retryAfterMs=${result.retryAfterMs}`);

  return new Response(
    JSON.stringify({ error: 'Too many requests — please try again later' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        // tRPC sets 429 itself; these routes are plain handlers, so both the
        // status and the Retry-After header are set here.
        'Retry-After': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))),
        'X-RateLimit-Limit': String(BUCKETS[bucket].max),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
