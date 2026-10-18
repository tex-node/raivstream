/**
 * Single Redis client, shared by the rate limiter (§1.4) and the read cache
 * (§1.5). Deliberately one instance: two clients would double the connection
 * pool for no benefit, and the constraint is explicit.
 *
 * Lazy — no connection at import time. Throws loudly if unconfigured: the rate
 * limiter must fail closed (D-067), and the cache's fail-open behaviour is
 * handled around this call, not by silently returning a fake client.
 */

import { Redis } from '@upstash/redis';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_URL;
    const token = process.env.UPSTASH_REDIS_TOKEN;
    if (!url || !token) {
      throw new Error(
        'Redis requires UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN. '
        + 'They belong in apps/web/.env.local (the file PM2 sources), not the root .env.',
      );
    }
    client = new Redis({ url, token });
  }
  return client;
}

/** Test seam — inject a fake client for both the cache and the rate limiter. */
export function __setRedisClientForTests(fake: unknown): void {
  client = fake as Redis | null;
}
