import { describe, expect, it } from 'vitest';
import { stableHash, resolveIdempotencyId, type IdempotencyStore } from '../idempotencyFor';

describe('stableHash', () => {
  it('is order-independent for object keys', () => {
    expect(stableHash({ a: 1, b: 2, c: { x: 1, y: 2 } })).toBe(stableHash({ c: { y: 2, x: 1 }, b: 2, a: 1 }));
  });

  it('differs for different values', () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 1, b: 1 }));
  });

  it('is a 12-hex-char string', () => {
    expect(stableHash({ a: 1 })).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('resolveIdempotencyId', () => {
  /** A counting id factory so reuse-vs-new is observable. */
  function counter() {
    let n = 0;
    return () => `id-${(n += 1)}`;
  }

  it('same inputs -> same id (reused)', () => {
    const gen = counter();
    let store: IdempotencyStore | null = null;
    const a = resolveIdempotencyId(store, { x: 1, y: 'a' }, gen); store = a.store;
    const b = resolveIdempotencyId(store, { x: 1, y: 'a' }, gen); store = b.store;
    expect(b.id).toBe(a.id);
    expect(gen).toBeTruthy();
  });

  it('changed inputs -> new id', () => {
    const gen = counter();
    let store: IdempotencyStore | null = null;
    const a = resolveIdempotencyId(store, { x: 1 }, gen); store = a.store;
    const b = resolveIdempotencyId(store, { x: 2 }, gen); store = b.store;
    expect(b.id).not.toBe(a.id);
  });

  it('reverting inputs to a prior state -> new id (never reuses an old id)', () => {
    const gen = counter();
    let store: IdempotencyStore | null = null;
    const a = resolveIdempotencyId(store, { x: 1 }, gen); store = a.store;
    const b = resolveIdempotencyId(store, { x: 2 }, gen); store = b.store;
    const c = resolveIdempotencyId(store, { x: 1 }, gen); store = c.store;
    expect(c.id).not.toBe(a.id);
    expect(c.id).not.toBe(b.id);
  });
});
