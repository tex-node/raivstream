import { describe, it, expect, vi } from 'vitest';
import { resolveSegmentStore } from '../render';

/**
 * The off switch, tested rather than asserted in a comment.
 *
 * `CACHE_SEGMENTS_ENABLED` must be a genuine off switch: when it is not 'true',
 * the renderer must never touch a store - no `has()`, no `upload()`. That is the
 * same class as the composer flag that was true in the database and undefined in
 * the code, and it is why this function exists instead of an inline env check.
 */
describe('resolveSegmentStore — the cache off switch', () => {
  const injected = {
    has: vi.fn(async () => true),
    download: vi.fn(async () => Buffer.from('cached')),
    upload: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };

  it('returns null when the flag is unset, even with a store injected', () => {
    expect(resolveSegmentStore({} as NodeJS.ProcessEnv, injected)).toBeNull();
  });

  it('returns null for any value other than the exact string "true"', () => {
    for (const value of ['false', '1', 'TRUE', 'yes', '']) {
      expect(resolveSegmentStore({ CACHE_SEGMENTS_ENABLED: value } as NodeJS.ProcessEnv, injected)).toBeNull();
    }
  });

  it('returns the injected store when the flag is exactly "true"', () => {
    expect(resolveSegmentStore({ CACHE_SEGMENTS_ENABLED: 'true' } as NodeJS.ProcessEnv, injected)).toBe(injected);
  });

  it('respects an explicit null injection (tests can force uncached behaviour)', () => {
    expect(resolveSegmentStore({ CACHE_SEGMENTS_ENABLED: 'true' } as NodeJS.ProcessEnv, null)).toBeNull();
  });
});
