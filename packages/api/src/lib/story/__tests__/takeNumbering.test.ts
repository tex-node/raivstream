import { describe, expect, it } from 'vitest';
import {
  TAKE_IDEMPOTENCY_BUCKET_MS,
  classifyTakeUniqueViolation,
  deriveTakeIdempotencyKey,
  nextTakeNumber,
  staleTakeConflict,
} from '../takeNumbering';

const base = { sceneId: 'scene-1', prompt: 'a dog at school', expectedTakeNumber: 1 };
const T0 = 1_700_000_000_000;

describe('derived take idempotency key — the bucket is a decision', () => {
  it('a retry at +30s returns the same key (same bucket → existing take)', () => {
    const first = deriveTakeIdempotencyKey({ ...base, now: T0 });
    const retry = deriveTakeIdempotencyKey({ ...base, now: T0 + 30_000 });
    expect(retry).toBe(first);
  });

  it('a retry at +90s produces a different key (new intent → new take)', () => {
    const first = deriveTakeIdempotencyKey({ ...base, now: T0 });
    const later = deriveTakeIdempotencyKey({ ...base, now: T0 + 90_000 });
    expect(later).not.toBe(first);
  });

  it('a different prompt or expected take is a different key even in the same bucket', () => {
    const first = deriveTakeIdempotencyKey({ ...base, now: T0 });
    expect(deriveTakeIdempotencyKey({ ...base, prompt: 'a cat at school', now: T0 })).not.toBe(first);
    expect(deriveTakeIdempotencyKey({ ...base, expectedTakeNumber: 2, now: T0 })).not.toBe(first);
  });

  it('bucket width is a named constant, not a magic number in the router', () => {
    expect(TAKE_IDEMPOTENCY_BUCKET_MS).toBe(60_000);
    // An exact bucket boundary flips the key; one millisecond earlier does not.
    expect(deriveTakeIdempotencyKey({ ...base, now: T0 })).not.toBe(
      deriveTakeIdempotencyKey({ ...base, now: T0 + TAKE_IDEMPOTENCY_BUCKET_MS }),
    );
  });
});

describe('take numbering', () => {
  it('first take is 1, then max+1', () => {
    expect(nextTakeNumber(null)).toBe(1);
    expect(nextTakeNumber(undefined)).toBe(1);
    expect(nextTakeNumber(1)).toBe(2);
    expect(nextTakeNumber(19)).toBe(20);
  });
});

describe('two P2002 sources, two meanings', () => {
  it('classifies the idempotency violation', () => {
    expect(classifyTakeUniqueViolation({ code: 'P2002', meta: { target: ['sceneId', 'idempotencyKey'] } }))
      .toBe('idempotencyKey');
  });

  it('classifies the takeNumber violation separately', () => {
    expect(classifyTakeUniqueViolation({ code: 'P2002', meta: { target: ['sceneId', 'takeNumber'] } }))
      .toBe('takeNumber');
  });

  it('ignores other errors and other unique constraints', () => {
    expect(classifyTakeUniqueViolation({ code: 'P2025' })).toBeNull();
    expect(classifyTakeUniqueViolation({ code: 'P2002', meta: { target: ['email'] } })).toBeNull();
    expect(classifyTakeUniqueViolation(null)).toBeNull();
  });
});

describe('stale revision conflict', () => {
  it('is not a conflict when the client sent no expectation', () => {
    expect(staleTakeConflict({ expectedTakeNumber: null, currentTakeNumber: 5 })).toBeNull();
  });

  it('is not a conflict when the client is current or ahead', () => {
    expect(staleTakeConflict({ expectedTakeNumber: 2, currentTakeNumber: 2 })).toBeNull();
    expect(staleTakeConflict({ expectedTakeNumber: 2, currentTakeNumber: 1 })).toBeNull();
  });

  it('is a typed conflict when the scene moved on, and names the current take', () => {
    expect(staleTakeConflict({ expectedTakeNumber: 1, currentTakeNumber: 2 })).toEqual({
      currentTakeNumber: 2,
    });
  });
});
