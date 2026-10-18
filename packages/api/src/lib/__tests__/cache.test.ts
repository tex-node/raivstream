import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cached, invalidate } from '../cache';
import { __setRedisClientForTests } from '../redis';

/**
 * In-memory fake with the subset of the Upstash client the cache uses
 * (get / set with px / del / scan). No network.
 */

type Entry = { raw: unknown; expiresAt: number };

function makeFakeRedis(overrides: Partial<{ get: unknown; set: unknown }> = {}) {
  const store = new Map<string, Entry>();
  const redis = {
    store,
    get: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.raw;
    },
    set: async (key: string, value: unknown, opts?: { px?: number }) => {
      store.set(key, { raw: value, expiresAt: Date.now() + (opts?.px ?? 0) });
      return 'OK';
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
    scan: async () => ['0', [] as string[]],
    ...overrides,
  };
  return redis;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T14:00:00Z').getTime());
  __setRedisClientForTests(makeFakeRedis());
});

afterEach(() => {
  vi.useRealTimers();
  __setRedisClientForTests(null);
});

describe('cached', () => {
  it('1. miss → calls fn, caches the result and returns it', async () => {
    const fn = vi.fn(async () => ({ value: 42 }));
    const result = await cached('k1', 1_000, fn);

    expect(result).toEqual({ value: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(await cached('k1', 1_000, fn)).toEqual({ value: 42 });
    expect(fn).toHaveBeenCalledTimes(1); // now a hit
  });

  it('2. hit → fn is not called', async () => {
    const first = vi.fn(async () => 'a');
    await cached('k2', 1_000, first);

    const second = vi.fn(async () => 'b');
    expect(await cached('k2', 1_000, second)).toBe('a');
    expect(second).not.toHaveBeenCalled();
  });

  it('3. expires after the TTL', async () => {
    const fn = vi.fn(async () => 'v');
    await cached('k3', 1_000, fn);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);
    await cached('k3', 1_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('4. invalidate clears the key', async () => {
    const fn = vi.fn(async () => 'v');
    await cached('k4', 10_000, fn);

    expect(await invalidate('k4')).toBe(true);

    await cached('k4', 10_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('5. Redis failing on get falls through to fn without throwing (D-068)', async () => {
    __setRedisClientForTests(makeFakeRedis({ get: async () => { throw new Error('redis down'); } }));

    const fn = vi.fn(async () => 'from-db');
    await expect(cached('k5', 1_000, fn)).resolves.toBe('from-db');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('6. Redis failing on set still returns the result (D-068)', async () => {
    __setRedisClientForTests(makeFakeRedis({ set: async () => { throw new Error('redis down'); } }));

    const fn = vi.fn(async () => 'from-db');
    await expect(cached('k6', 1_000, fn)).resolves.toBe('from-db');
  });

  it('round-trips Date fields (the feed cursor calls toISOString)', async () => {
    const when = new Date('2026-10-17T10:00:00Z');
    const fn = vi.fn(async () => ({ videos: [{ publishedAt: when }] }));

    await cached('k7', 10_000, fn);
    const hit = await cached('k7', 10_000, async () => ({ videos: [] as Array<{ publishedAt: Date }> }));

    expect(hit.videos[0]!.publishedAt).toBeInstanceOf(Date);
    expect(hit.videos[0]!.publishedAt.toISOString()).toBe(when.toISOString());
  });
});
