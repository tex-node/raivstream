import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { invalidatePrefix } from '../cache';
import { __setRedisClientForTests } from '../redis';

/**
 * SCAN-based prefix invalidation. The fake asserts the module never falls back
 * to `KEYS`, which would block Redis on a large keyspace.
 */

type Page = [string, string[]];

function makeScanRedis(pages: Page[]) {
  let index = 0;
  const deleted: string[][] = [];
  const keysSpy = vi.fn(async () => {
    throw new Error('KEYS must never be called');
  });
  const redis = {
    deleted,
    keys: keysSpy,
    scan: async () => pages[Math.min(index++, pages.length - 1)]!,
    del: async (...keys: string[]) => {
      deleted.push(keys);
      return keys.length;
    },
  };
  return redis;
}

beforeEach(() => {
  __setRedisClientForTests(null);
});

afterEach(() => {
  __setRedisClientForTests(null);
});

describe('invalidatePrefix', () => {
  it('7. deletes every key across SCAN pages', async () => {
    const redis = makeScanRedis([
      ['42', ['feed:trending:cursor=null:limit=10:kidsOnly=false', 'feed:trending:cursor=1:limit=10:kidsOnly=false']],
      ['0', ['feed:trending:cursor=2:limit=10:kidsOnly=false']],
    ]);
    __setRedisClientForTests(redis);

    const deleted = await invalidatePrefix('feed:trending:');

    expect(deleted).toBe(3);
    expect(redis.deleted.flat()).toEqual([
      'feed:trending:cursor=null:limit=10:kidsOnly=false',
      'feed:trending:cursor=1:limit=10:kidsOnly=false',
      'feed:trending:cursor=2:limit=10:kidsOnly=false',
    ]);
  });

  it('8. never calls KEYS', async () => {
    const redis = makeScanRedis([['0', ['a:1']]]);
    __setRedisClientForTests(redis);

    await invalidatePrefix('a:');

    expect(redis.keys).not.toHaveBeenCalled();
  });

  it('9. returns the number of deleted keys', async () => {
    const redis = makeScanRedis([['0', []]]);
    __setRedisClientForTests(redis);

    expect(await invalidatePrefix('nothing:')).toBe(0);
  });

  it('fails open when Redis errors', async () => {
    __setRedisClientForTests({ scan: async () => { throw new Error('redis down'); }, del: async () => 0 });

    await expect(invalidatePrefix('x:')).resolves.toBe(0);
  });
});
