import { describe, expect, it, vi } from 'vitest';
import { runRelight, transformErrorCode } from '../procedure';

/**
 * The procedure that can finally ask for a relight (2026-11-15).
 *
 * The duration comes from the source ROW, never from the caller; the ceiling is asserted before the charge;
 * and every transform failure maps to a typed error instead of a 500.
 */
const RATES: Record<string, number> = { 'transform:relight:720p': 263 };

function fakePrisma(over: { sourceDuration?: number | null; ceilingSpent?: number; noProject?: boolean } = {}) {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    creativeProject: {
      findFirst: vi.fn(async () => (over.noProject ? null : { id: 'p1' })),
      findUnique: vi.fn(async () => ({ userId: 'u1' })),
    },
    creativeProducedAsset: {
      findFirst: vi.fn(async () => ({ id: 'src-1', durationSeconds: over.sourceDuration === undefined ? 3 : over.sourceDuration })),
      findUnique: vi.fn(async () => ({ id: 'src-1', projectId: 'p1', sceneId: 's1', shotId: null, kind: 'IMAGE', assetUrl: 'https://cdn/src.mp4', durationSeconds: over.sourceDuration === undefined ? 3 : over.sourceDuration })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: 'new-1' }; }),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    creditTransaction: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    creditBalance: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn(async () => ({ balance: 100_000 })) },
    featureCreditRate: {
      findUnique: vi.fn(async ({ where }: { where: { featureKey: string } }) =>
        RATES[where.featureKey] ? { creditsPerUnit: RATES[where.featureKey], isActive: true } : null),
    },
    creativeProductionRun: { findFirst: vi.fn(async () => ({ id: 'run-1' })) },
    $transaction: vi.fn(async (ops: unknown) => ops),
  } as never;
  return { prisma, created };
}

describe('runRelight', () => {
  it('charges rate x billed seconds for the row duration - 3 s bills 6 s = 1,578', async () => {
    const { prisma } = fakePrisma({ sourceDuration: 3 });
    const result = await runRelight(prisma, { projectId: 'p1', assetId: 'src-1', resolution: '720p', userId: 'u1' }, {
      render: async () => 'https://cdn/relit.mp4',
      loadBudget: async () => ({ ceiling: null, spent: 0 }),
      assertCeiling: () => undefined,
    });
    expect(result.billedSeconds).toBe(6);
    expect(result.creditsCharged).toBe(1578);
  });

  it('refuses an asset with no recorded duration, before any charge', async () => {
    const { prisma, created } = fakePrisma({ sourceDuration: null });
    await expect(runRelight(prisma, { projectId: 'p1', assetId: 'src-1', resolution: '720p', userId: 'u1' }, {
      render: async () => 'x', loadBudget: async () => ({ ceiling: null, spent: 0 }), assertCeiling: () => undefined,
    })).rejects.toThrow(/duration|Duration/);
    expect(created).toHaveLength(0);
  });

  it('returns a typed not-found for a project the caller does not own', async () => {
    const { prisma } = fakePrisma({ noProject: true });
    await expect(runRelight(prisma, { projectId: 'p1', assetId: 'src-1', resolution: '720p', userId: 'u2' }, { render: async () => 'x' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('maps each transform failure to its own code rather than a 500', () => {
    expect(transformErrorCode(new Error('TRANSFORM_DURATION_REQUIRED: x')).code).toBe('PRECONDITION_FAILED');
    expect(transformErrorCode(new Error('TRANSFORM_RATE_MISSING: x')).code).toBe('PRECONDITION_FAILED');
    expect(transformErrorCode(new Error('TRANSFORM_BODY_INVALID: x')).code).toBe('BAD_REQUEST');
    expect(transformErrorCode(new Error('TRANSFORM_SOURCE_NOT_FOUND: x')).code).toBe('NOT_FOUND');
  });
});
