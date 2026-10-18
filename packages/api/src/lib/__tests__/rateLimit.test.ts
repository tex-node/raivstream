import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkLimit, BUCKETS, __setRateLimitRedisForTests } from '../resilience/rateLimit';

/**
 * Tests a fake in-memory Redis with the same pipeline shape the module uses
 * (incr / expire / get), driven by vitest fake timers so window maths is
 * deterministic. No network, no Upstash.
 */

function makeFakeRedis() {
  const store = new Map<string, number>();
  const expiry = new Map<string, number>();
  const api = {
    pipeline() {
      const ops: Array<() => unknown> = [];
      const p = {
        incr(key: string) {
          ops.push(() => {
            const next = (store.get(key) ?? 0) + 1;
            store.set(key, next);
            return next;
          });
          return p;
        },
        expire(key: string, seconds: number) {
          ops.push(() => {
            expiry.set(key, Date.now() + seconds * 1000);
            return 1;
          });
          return p;
        },
        get(key: string) {
          ops.push(() => {
            const exp = expiry.get(key);
            if (exp !== undefined && exp <= Date.now()) {
              store.delete(key);
              return null;
            }
            return store.get(key) ?? null;
          });
          return p;
        },
        async exec() {
          // @upstash/redis v1.28 returns raw results, in pipeline order.
          return ops.map((op) => op());
        },
      };
      return p;
    },
  };
  return api;
}

const T0 = new Date('2026-10-18T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  __setRateLimitRedisForTests(makeFakeRedis());
});

afterEach(() => {
  vi.useRealTimers();
  __setRateLimitRedisForTests(null);
});

describe('checkLimit — sliding window', () => {
  it('1. allows under the limit and reports remaining', async () => {
    const first = await checkLimit('user:u1:test', 'expensive');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(BUCKETS.expensive.max - 1);

    const second = await checkLimit('user:u1:test', 'expensive');
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(BUCKETS.expensive.max - 2);
  });

  it('2. allows the last request in the window (remaining 0)', async () => {
    let last;
    for (let i = 0; i < BUCKETS.expensive.max; i += 1) {
      last = await checkLimit('user:u1:test', 'expensive');
    }
    expect(last!.allowed).toBe(true);
    expect(last!.remaining).toBe(0);
  });

  it('3. rejects over the limit with a bounded retryAfterMs', async () => {
    for (let i = 0; i < BUCKETS.expensive.max; i += 1) {
      await checkLimit('user:u1:test', 'expensive');
    }
    const over = await checkLimit('user:u1:test', 'expensive');

    expect(over.allowed).toBe(false);
    expect(over.retryAfterMs).toBeGreaterThan(0);
    expect(over.retryAfterMs).toBeLessThanOrEqual(BUCKETS.expensive.windowMs);
    expect(over.bucket).toBe('expensive');
  });

  it('4. resets after the windows fully decay', async () => {
    for (let i = 0; i < BUCKETS.expensive.max; i += 1) {
      await checkLimit('user:u1:test', 'expensive');
    }
    expect((await checkLimit('user:u1:test', 'expensive')).allowed).toBe(false);

    // Two windows later neither the current nor the previous window has data.
    vi.advanceTimersByTime(BUCKETS.expensive.windowMs * 2);

    const after = await checkLimit('user:u1:test', 'expensive');
    expect(after.allowed).toBe(true);
  });

  it('5. keeps independent keys independent', async () => {
    for (let i = 0; i < BUCKETS.expensive.max; i += 1) {
      await checkLimit('user:u1:test', 'expensive');
    }
    expect((await checkLimit('user:u1:test', 'expensive')).allowed).toBe(false);

    const other = await checkLimit('user:u2:test', 'expensive');
    expect(other.allowed).toBe(true);
  });

  it('6. keeps buckets independent for the same key', async () => {
    for (let i = 0; i < BUCKETS.expensive.max; i += 1) {
      await checkLimit('user:u1:b', 'expensive');
    }
    expect((await checkLimit('user:u1:b', 'expensive')).allowed).toBe(false);

    const auth = await checkLimit('user:u1:b', 'auth');
    expect(auth.allowed).toBe(true);
    expect(auth.bucket).toBe('auth');
  });

  it('parses the [error, value] pair shape too (defensive)', async () => {
    // The shipped bug: @upstash/redis v1.28 returns raw results, and reading
    // only `[error, value]` pairs yielded `undefined` → count 0 → no limiting.
    const store = new Map<string, number>();
    const pairRedis = {
      pipeline() {
        const ops: Array<() => unknown> = [];
        const p = {
          incr(key: string) {
            ops.push(() => {
              const next = (store.get(key) ?? 0) + 1;
              store.set(key, next);
              return next;
            });
            return p;
          },
          expire() { ops.push(() => 1); return p; },
          get(key: string) { ops.push(() => store.get(key) ?? null); return p; },
          async exec() { return ops.map((op) => [null, op()]); },
        };
        return p;
      },
    };
    __setRateLimitRedisForTests(pairRedis);

    const first = await checkLimit('user:pair:test', 'expensive');
    const second = await checkLimit('user:pair:test', 'expensive');

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(BUCKETS.expensive.max - 1);
    expect(second.remaining).toBe(BUCKETS.expensive.max - 2);
  });

  it('throws loudly when Redis is not configured', async () => {
    __setRateLimitRedisForTests(null);
    const savedUrl = process.env.UPSTASH_REDIS_URL;
    const savedToken = process.env.UPSTASH_REDIS_TOKEN;
    delete process.env.UPSTASH_REDIS_URL;
    delete process.env.UPSTASH_REDIS_TOKEN;

    try {
      await expect(checkLimit('user:u1:test', 'auth')).rejects.toThrow(/UPSTASH_REDIS_URL/);
    } finally {
      if (savedUrl !== undefined) process.env.UPSTASH_REDIS_URL = savedUrl;
      if (savedToken !== undefined) process.env.UPSTASH_REDIS_TOKEN = savedToken;
    }
  });
});
