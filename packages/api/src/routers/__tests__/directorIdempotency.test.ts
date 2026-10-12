/**
 * Phase 1 — director.compose idempotency.
 *
 * Proves the router binds a deterministic credit key to the client-supplied
 * `idempotencyId`: a duplicate submit reuses the same key (so the ledger's
 * UNIQUE(idempotencyKey) dedupes it), while a different id yields a different
 * key (a genuine second charge). Unit-level with mocked Prisma + credits.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
  resolveFeatureCreditRate: vi.fn(),
  getFeatureCreditCost: vi.fn(),
  compose: vi.fn(),
  isConfigured: true,
  moderatePrompt: vi.fn(),
  moderationRejectMessage: vi.fn(),
}));

vi.mock('../../lib/credits', () => ({
  deductCredits: mocks.deductCredits,
  refundCredits: mocks.refundCredits,
  resolveFeatureCreditRate: mocks.resolveFeatureCreditRate,
  getFeatureCreditCost: mocks.getFeatureCreditCost,
}));

vi.mock('../../lib/movieDirector', () => ({
  DIRECTOR_MAX_SCENES: 6,
  movieDirector: {
    get isConfigured() {
      return mocks.isConfigured;
    },
    compose: mocks.compose,
  },
}));

vi.mock('../../lib/promptModeration', () => ({
  moderatePrompt: mocks.moderatePrompt,
  moderationRejectMessage: mocks.moderationRejectMessage,
}));

import { directorRouter, DIRECTOR_FEATURE_KEY } from '../director';
import { creditKeys } from '../../lib/credits/idempotencyKeys';

const USER = { id: 'u1', role: 'USER', email: 'u1@test.local', username: 'u1' };
const ctx = { prisma: {} as never, userId: 'u1', user: USER as never, isR16: false } as never;

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';
const base = {
  scene: 'a scene long enough to pass the minimum length',
  sceneCount: 1,
  format: 'CONTINUOUS' as const,
  charCeiling: 4000 as const,
  cast: [],
  references: [],
  idempotencyId: ID_A,
};

function chargedKeys(): unknown[] {
  return (mocks.deductCredits.mock.calls as unknown[][]).map((c) => c[5]);
}

beforeEach(() => {
  mocks.resolveFeatureCreditRate.mockResolvedValue({ configured: true, cost: 50, errorCode: null });
  mocks.getFeatureCreditCost.mockResolvedValue(50);
  mocks.deductCredits.mockResolvedValue(50);
  mocks.refundCredits.mockResolvedValue(undefined);
  mocks.compose.mockResolvedValue({ scenes: [], warnings: [] });
  mocks.moderatePrompt.mockResolvedValue({ allowed: true });
});

describe('director.compose idempotency', () => {
  it('charges with a key derived from the client idempotencyId', async () => {
    const caller = directorRouter.createCaller(ctx);
    await caller.compose(base);
    expect(mocks.deductCredits).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      DIRECTOR_FEATURE_KEY,
      `director:${ID_A}`,
      expect.any(String),
      creditKeys.director.charge(ID_A),
    );
  });

  it('reuses the same key on a duplicate submit (ledger dedupes the second charge)', async () => {
    const caller = directorRouter.createCaller(ctx);
    await caller.compose(base);
    await caller.compose(base);
    expect(chargedKeys()).toEqual([
      creditKeys.director.charge(ID_A),
      creditKeys.director.charge(ID_A),
    ]);
  });

  it('a different idempotencyId yields a different key (a second charge)', async () => {
    const caller = directorRouter.createCaller(ctx);
    await caller.compose(base);
    await caller.compose({ ...base, idempotencyId: ID_B });
    const keys = chargedKeys();
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toBe(creditKeys.director.charge(ID_A));
    expect(keys[1]).toBe(creditKeys.director.charge(ID_B));
  });

  it('the refund key mirrors the charge key for the same id', async () => {
    mocks.compose.mockRejectedValue(new Error('model failed'));
    const caller = directorRouter.createCaller(ctx);
    await expect(caller.compose(base)).rejects.toThrow();
    expect(mocks.refundCredits).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      50,
      DIRECTOR_FEATURE_KEY,
      `director:${ID_A}`,
      expect.any(String),
      creditKeys.director.refund(ID_A),
    );
  });
});
