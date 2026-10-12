/**
 * Phase 2 (R16-04) — pause-resume procedure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/promptModeration', () => ({
  moderatePrompt: vi.fn(async () => ({ allowed: true, flagged: false, categories: [], scores: {} })),
  moderationRejectMessage: vi.fn(() => 'rejected'),
  suggestSafeRewrite: vi.fn(async () => null),
}));
vi.mock('../../lib/analytics', () => ({ analytics: { track: vi.fn(async () => undefined) } }));
vi.mock('../../lib/credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/credits')>();
  return {
    ...actual,
    deductCredits: vi.fn(async () => 0),
    refundCredits: vi.fn(async () => undefined),
    getFeatureCreditCost: vi.fn(async () => 80),
  };
});
vi.mock('../../lib/r2', () => ({
  mirrorUrlToR2: vi.fn(async () => 'https://cdn.test/x.png'),
  uploadBufferToR2: vi.fn(async () => 'https://cdn.test/x.png'),
  getPublicUrlForKey: vi.fn(() => 'https://cdn.test/x'),
}));

import { storyRouter } from '../story';

function makePrisma(status: string) {
  const run: Record<string, unknown> = {
    id: 'run-1', projectId: 'p1', status, concurrency: 2, costCapCredits: 10000, costUsedCredits: 8000,
    createdByUserId: 'u1', startedAt: null, lastHeartbeatAt: null, pauseReason: 'cap', sceneIds: [],
  };
  return {
    batchGenerationRun: {
      findFirst: vi.fn(async () => ({ ...run })),
      findUnique: vi.fn(async () => ({ ...run, status: 'RUNNING' })),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...run, ...data })),
    },
    batchGenerationItem: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      updateMany: vi.fn(async () => ({ count: 0 })),
      update: vi.fn(async () => ({})),
    },
    storyProject: { findFirst: vi.fn(async () => ({ id: 'p1' })) },
    analyticsEvent: { create: vi.fn(async () => ({})) },
  };
}

const ctx = (prisma: unknown) => ({ user: { id: 'u1', role: 'USER' }, isR16: false, prisma }) as never;

beforeEach(() => vi.clearAllMocks());

describe('resumeBatchRun', () => {
  it('resumes a PAUSED run with a higher cap and re-kicks the worker', async () => {
    const prisma = makePrisma('PAUSED');
    await storyRouter.createCaller(ctx(prisma)).resumeBatchRun({ runId: 'run-1', costCapCredits: 20000 });
    const data = (prisma.batchGenerationRun.update as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.status).toBe('RUNNING');
    expect(data.pauseReason).toBeNull();
    expect(data.costCapCredits).toBe(20000);
  });

  it('resumes with the stored cap when none is provided', async () => {
    const prisma = makePrisma('PAUSED');
    await storyRouter.createCaller(ctx(prisma)).resumeBatchRun({ runId: 'run-1' });
    const data = (prisma.batchGenerationRun.update as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.status).toBe('RUNNING');
    expect(data.costCapCredits).toBeUndefined();
  });

  it('rejects a cap at or below what has already been used (names both numbers)', async () => {
    const prisma = makePrisma('PAUSED');
    await expect(storyRouter.createCaller(ctx(prisma)).resumeBatchRun({ runId: 'run-1', costCapCredits: 8000 }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('8000') });
    expect(prisma.batchGenerationRun.update).not.toHaveBeenCalled();
  });

  it('rejects a run that is not PAUSED', async () => {
    const prisma = makePrisma('RUNNING');
    await expect(storyRouter.createCaller(ctx(prisma)).resumeBatchRun({ runId: 'run-1', costCapCredits: 20000 }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
