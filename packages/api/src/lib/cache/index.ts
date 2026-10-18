/**
 * Operational patterns §1.5 — Redis-backed read cache.
 *
 * Load protection, not latency repair: every Ravenstream read is already
 * sub-millisecond (99.98 % Postgres block-cache hit), so the point is absorbing
 * traffic spikes and reducing contention during bursts.
 *
 * ── Failure policy (D-068) ──────────────────────────────────────────────────
 * FAIL OPEN. Any Redis error is logged and the caller's `fn()` runs instead;
 * `cached()` never throws on infrastructure failure. This is deliberately the
 * opposite of the rate limiter (D-067), which fails closed: a cache that fails
 * closed turns every miss into an outage.
 *
 * ── Serialization ──────────────────────────────────────────────────────────
 * Values are JSON-encoded with `Date` instances tagged as `{ "__rvDate": iso }`
 * and revived on read, so cached rows keep real `Date` objects (the feed cursor
 * code calls `publishedAt.toISOString()` — a plain JSON round-trip would throw
 * on a cache hit). The Upstash client may hand back either a string or an
 * already-parsed object depending on `automaticDeserialization`; both paths are
 * handled.
 *
 * ── Client ─────────────────────────────────────────────────────────────────
 * Shares the single Redis client with the rate limiter — never a second one.
 */

import { getRedis } from '../redis';

const DATE_TAG = '__rvDate';

/**
 * Tag Dates BEFORE stringifying. A `JSON.stringify` replacer cannot do this:
 * the spec calls `Date.prototype.toJSON` first, so the replacer only ever sees
 * an ISO string — the resulting cache entry would silently lose its Date type
 * and break the feed cursor's `publishedAt.toISOString()` on a hit.
 */
function tagDates(value: unknown): unknown {
  if (value instanceof Date) return { [DATE_TAG]: value.toISOString() };
  if (Array.isArray(value)) return value.map(tagDates);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) out[key] = tagDates(val);
    return out;
  }
  return value;
}

function encode(value: unknown): string {
  return JSON.stringify(tagDates(value));
}

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    const tagged = (value as Record<string, unknown>)[DATE_TAG];
    if (typeof tagged === 'string') return new Date(tagged);
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) out[key] = revive(val);
    return out;
  }
  return value;
}

function decode<T>(raw: unknown): T {
  if (typeof raw === 'string') {
    try {
      return revive(JSON.parse(raw)) as T;
    } catch {
      return raw as unknown as T;
    }
  }
  return revive(raw) as T;
}

function logError(op: string, key: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[cache.error] op=${op} key=${key} error=${message}`);
}

/**
 * Get-or-set with fail-open fallback (D-068). On Redis error, calls `fn()` and
 * returns its result without caching. Never throws on infrastructure failure.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await getRedis().get(key);
  } catch (error) {
    logError('get', key, error);
    return fn();
  }

  if (raw !== null && raw !== undefined) return decode<T>(raw);

  const value = await fn();

  try {
    await getRedis().set(key, encode(value), { px: ttlMs });
  } catch (error) {
    // Result is still correct — it simply is not cached.
    logError('set', key, error);
  }

  return value;
}

/** Delete a specific key. Returns true if a key was removed. */
export async function invalidate(key: string): Promise<boolean> {
  try {
    const removed = await getRedis().del(key);
    return Number(removed) > 0;
  } catch (error) {
    logError('del', key, error);
    return false;
  }
}

/**
 * Delete all keys matching a prefix using SCAN (never KEYS), 100 keys per page
 * and per DEL batch. Fail-open: returns the number actually deleted.
 */
export async function invalidatePrefix(prefix: string): Promise<number> {
  let cursor = '0';
  let deleted = 0;
  try {
    const redis = getRedis();
    do {
      const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
      cursor = String(next);
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
  } catch (error) {
    logError('scan', prefix, error);
  }
  return deleted;
}

/**
 * Invalidate both feed caches after a feed *membership* change (D-071).
 * Engagement changes deliberately do not call this — see D-071/D-072.
 */
export async function invalidateFeedCaches(): Promise<number> {
  const trending = await invalidatePrefix('feed:trending:');
  const forYou = await invalidatePrefix('feed:forYou:');
  return trending + forYou;
}
