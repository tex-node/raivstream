import { describe, expect, it, vi } from 'vitest';
import { creditKeys } from '../../../credits/idempotencyKeys';
import { billedSeconds, deriveTransformTake, planTransformCharge, transformFeatureKey, transformProvenance } from '../derivedAsset';

const RATES: Record<string, number> = {
  'transform:relight:480p': 140, 'transform:relight:768p': 224, 'transform:recast:768p': 238,
  'transform:restyle:720p': 263, 'transform:environment:720p': 263,
};

function fakePrisma() {
  const calls = { created: [] as Array<Record<string, unknown>>, updated: [] as Array<{ data: Record<string, unknown> }> };
  const prisma = {
    featureCreditRate: { findUnique: vi.fn(async ({ where }: { where: { featureKey: string } }) => RATES[where.featureKey] ? { creditsPerUnit: RATES[where.featureKey], isActive: true } : null) },
    creativeProject: { findUnique: vi.fn(async () => ({ userId: 'u1' })) },
    creativeProducedAsset: {
      findUnique: vi.fn(async () => ({ id: 'src-1', projectId: 'p1', sceneId: 's1', shotId: null, kind: 'IMAGE', assetUrl: 'https://cdn/src.png' })),
      findFirst: vi.fn(async () => ({ id: 'prev-1', takeNumber: 4 })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { calls.created.push(data); return { id: 'new-1' }; }),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => { calls.updated.push(args); return {}; }),
      updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => { calls.updated.push(args); return { count: 1 }; }),
    },
    creditTransaction: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    creditBalance: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn(async () => ({ balance: 10_000 })) },
    $transaction: vi.fn(async (ops: unknown) => ops),
  } as never;
  return { prisma, calls };
}

describe('billed duration per operation', () => {
  it('relight bills the output duration', () => { expect(billedSeconds('relight', 10)).toBe(10); });
  it('restyle bills input + output with a minimum of 2x output', () => {
    expect(billedSeconds('restyle', 10, 10)).toBe(20);
    expect(billedSeconds('restyle', 10, 30)).toBe(40);
    expect(billedSeconds('restyle', 10, 5)).toBe(20);
  });
  it('refuses to bill without a duration', () => { expect(() => billedSeconds('relight', 0)).toThrow(/TRANSFORM_DURATION_REQUIRED/); });
});

describe('the charge is rate x billed seconds', () => {
  it('relight 768p for 10 s is 2,240 credits', async () => {
    const { prisma } = fakePrisma();
    const plan = await planTransformCharge(prisma, { operation: 'relight', resolution: '768p', outputSeconds: 10 });
    expect(plan.credits).toBe(2240);
  });
  it('restyle 720p for 10 s is billed 20 s and costs 5,260 credits', async () => {
    const { prisma } = fakePrisma();
    const plan = await planTransformCharge(prisma, { operation: 'restyle', resolution: '720p', outputSeconds: 10, inputSeconds: 10 });
    expect(plan.billedSeconds).toBe(20);
    expect(plan.credits).toBe(5260);
  });
  it('a missing rate fails closed', async () => {
    const { prisma } = fakePrisma();
    await expect(planTransformCharge(prisma, { operation: 'relight', resolution: '2k', outputSeconds: 10 })).rejects.toThrow(/TRANSFORM_RATE_MISSING/);
  });
  it('keys and provenance name operation and tier', () => {
    expect(transformFeatureKey('relight', '2k')).toBe('transform:relight:2k');
    expect(transformProvenance('recast', '1080P')).toBe('transform:recast:1080p');
  });
});

describe('the derived take', () => {
  it('is a new row with provenance and a demoted prior take', async () => {
    const { prisma, calls } = fakePrisma();
    const result = await deriveTransformTake(prisma, { render: async () => 'https://cdn/relit.png' }, {
      projectId: 'p1', sourceAssetId: 'src-1', operation: 'relight', resolution: '768p', outputSeconds: 10,
    });
    expect(result.takeNumber).toBe(5);
    expect(result.parentTakeId).toBe('prev-1');
    expect(result.producedBy).toBe('transform:relight:768p');
    expect(result.creditsCharged).toBe(2240);
    expect(calls.created[0]!.producedBy).toBe('transform:relight:768p');
    expect(calls.created[0]!.sourceAssetId).toBe('src-1');
    expect(calls.updated.some((u) => u.data.isLatest === false)).toBe(true);
  });
  it('refuses a source from another project', async () => {
    const { prisma } = fakePrisma();
    await expect(deriveTransformTake(prisma, { render: async () => 'x' }, {
      projectId: 'other', sourceAssetId: 'src-1', operation: 'relight', resolution: '768p', outputSeconds: 10,
    })).rejects.toThrow(/TRANSFORM_SOURCE_NOT_FOUND/);
  });
  it('marks the row FAILED when the render fails', async () => {
    const { prisma, calls } = fakePrisma();
    await expect(deriveTransformTake(prisma, { render: async () => { throw new Error('provider down'); } }, {
      projectId: 'p1', sourceAssetId: 'src-1', operation: 'relight', resolution: '768p', outputSeconds: 10,
    })).rejects.toThrow(/provider down/);
    expect(calls.updated.some((u) => u.data.status === 'FAILED')).toBe(true);
  });
});

describe('the money path, audited', () => {
  it('a transformation and a generation charge for the same asset id use different keys', () => {
    const transform = creditKeys.transform.charge('asset-1', 0);
    const generation = creditKeys.generation.charge('asset-1', 0);
    expect(transform).not.toBe(generation);
    // Same shape, different domain - so neither can replay the other, and neither collides.
    expect(transform).toBe('transform:charge:asset-1:0');
    expect(generation).toBe('gen:charge:asset-1:0');
  });

  it('the transform key ends in an attempt number, so nextChargeAttempt can find and bump it', () => {
    // nextChargeAttempt finds prior charges by the `<...>:<id>:` prefix and takes max(attempt)+1.
    expect(creditKeys.transform.charge('asset-1', 0)).toMatch(/:0$/);
    expect(creditKeys.transform.charge('asset-1', 3)).toMatch(/:3$/);
  });

  it('omitting amountCredits charges the rate - a documented default, not a silent zero', async () => {
    const { prisma } = fakePrisma();
    const charged = await chargeOrThrowForTest(prisma, 'transform:relight:768p');
    // The rate, not zero: the optional amount is a default, not a hole.
    expect(charged).toBe(224);
  });
});

async function chargeOrThrowForTest(prisma: never, featureKey: string) {
  const { chargeOrThrow } = await import('../../../credits');
  return chargeOrThrow(prisma, 'u1', featureKey, 'ref-1', 'test', 'test:charge:x:0');
}
