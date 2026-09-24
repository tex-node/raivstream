import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { creativeProcedure, router } from '../../../trpc';
import { buildCreativePlan } from '../production/plan';
import { interpret } from '../intent/interpreter';
import { runCreativeProduction, type ProductionDeps } from '../production/runner';
import { CreativeError } from '../shared/errors';

// Moderation + provider boundary mocks (the adapter imports these).
const mocks = vi.hoisted(() => ({
  submitGenerationJob: vi.fn(async () => ({ providerJobId: 'p1', outputUrl: 'r2://out' })),
  pollJobStatus: vi.fn(async () => ({ status: 'completed', outputUrl: 'r2://out' })),
  moderatePrompt: vi.fn(async () => ({ allowed: true } as { allowed: boolean; reason?: string; flaggedPhrase?: string })),
}));

vi.mock('../../generators', () => ({
  submitGenerationJob: mocks.submitGenerationJob,
  pollJobStatus: mocks.pollJobStatus,
}));
vi.mock('../../promptModeration', () => ({
  moderatePrompt: mocks.moderatePrompt,
  moderationRejectMessage: (moderation: { reason?: string }, fallback: string) => moderation.reason ?? fallback,
}));
vi.mock('../../r2', () => ({
  mirrorUrlToR2: async (url: string) => url,
  uploadBufferToR2: async () => 'r2://uploaded',
}));
vi.mock('../../lastFrameExtract', () => ({ extractLastFrameAsSeedImage: async () => null }));

import { generateStill, generateVideo } from '../production/generationAdapter';

const { submitGenerationJob, pollJobStatus, moderatePrompt } = mocks;

beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_PRODUCTION_ENABLED = 'true';
  submitGenerationJob.mockClear();
  pollJobStatus.mockClear();
  moderatePrompt.mockReset();
  moderatePrompt.mockResolvedValue({ allowed: true });
});
afterEach(() => {
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_PRODUCTION_ENABLED;
});

const USER = {
  id: 'u1', email: 'e', username: 'u', displayName: 'd', avatarUrl: null,
  role: 'CREATOR', premiumTier: 'FREE', verified: false, followerCount: 0, followingCount: 0, totalViews: 0, totalLikes: 0,
};

describe('safety — R16 isolation of the 5.0 creative layer', () => {
  const testRouter = router({ ping: creativeProcedure.query(() => 'ok') });

  it('rejects every creative procedure on the R16 surface', async () => {
    const caller = testRouter.createCaller({ prisma: {} as never, userId: 'u1', user: USER, isR16: true });
    await expect(caller.ping()).rejects.toThrow(/R16/);
  });

  it('allows creative procedures on the normal surface', async () => {
    const caller = testRouter.createCaller({ prisma: {} as never, userId: 'u1', user: USER, isR16: false });
    expect(await caller.ping()).toBe('ok');
  });

  it('still requires authentication', async () => {
    const caller = testRouter.createCaller({ prisma: {} as never, userId: null, user: null, isR16: false });
    await expect(caller.ping()).rejects.toThrow(/authenticated/i);
  });
});

describe('safety — the semantic layer cannot bypass moderation', () => {
  it('moderates a still prompt and never submits rejected content', async () => {
    moderatePrompt.mockResolvedValueOnce({ allowed: false, reason: 'This content violates our guidelines.', flaggedPhrase: 'gore' });
    await expect(generateStill({ kind: 'IMAGE', sceneId: 'SCENE_01', prompt: 'graphic gore', aspectRatio: '9:16' }, 'p1', 'a1')).rejects.toMatchObject({ code: 'CONTENT_REJECTED' });
    expect(submitGenerationJob).not.toHaveBeenCalled();
  });

  it('moderates a video prompt before submission', async () => {
    moderatePrompt.mockResolvedValueOnce({ allowed: false, reason: 'blocked' });
    await expect(generateVideo({ kind: 'VIDEO', sceneId: 'SCENE_01', prompt: 'bad', durationSeconds: 5, aspectRatio: '9:16', resolution: '1080P' }, 'p1', 'a1')).rejects.toMatchObject({ code: 'CONTENT_REJECTED' });
    expect(submitGenerationJob).not.toHaveBeenCalled();
  });

  it('submits allowed content normally', async () => {
    const media = await generateStill({ kind: 'IMAGE', sceneId: 'SCENE_01', prompt: 'a calm lake', aspectRatio: '9:16' }, 'p1', 'a1');
    expect(media.assetUrl).toBe('r2://out');
    expect(submitGenerationJob).toHaveBeenCalledTimes(1);
  });
});

describe('safety — content rejection fails only the affected asset and is never retried', () => {
  function prismaMock() {
    const assets: any[] = [];
    const project = { id: 'p1', userId: 'u1', status: 'APPROVED', projectType: 'COMMERCIAL' };
    const prisma: any = {
      creativeProject: {
        findUnique: async () => ({ ...project, productionPlan: { plan: PLAN }, bible: null }),
        update: async ({ data }: any) => { Object.assign(project, data); return project; },
      },
      creativeProducedAsset: {
        findMany: async () => assets.map((a) => ({ ...a })),
        create: async ({ data }: any) => { const row = { id: `a${assets.length + 1}`, createdAt: new Date(), ...data }; assets.push(row); return row; },
        update: async ({ where, data }: any) => { const row = assets.find((a) => a.id === where.id); Object.assign(row, data); return row; },
        deleteMany: async () => ({ count: 0 }),
      },
      __assets: assets,
    };
    return prisma;
  }
  const PLAN = buildCreativePlan({ projectType: interpret('a commercial').projectType });

  it('does not retry a CONTENT_REJECTED image and keeps the rest of the run', async () => {
    const prisma = prismaMock();
    const still = vi.fn(async () => { throw new CreativeError('CONTENT_REJECTED', 'blocked'); });
    const deps: ProductionDeps = {
      generateStill: still,
      generateVideo: vi.fn(async () => ({ assetUrl: 'r2://video' })),
      extractLastFrame: vi.fn(async () => null),
    };
    const result = await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps, { maxAttempts: 3 });
    // One call per scene (no retry on CONTENT_REJECTED), each failing only its own image.
    expect(still).toHaveBeenCalledTimes(PLAN.scenes.length);
    // Image fails → no byKey still entry → VIDEO has no seed → also fails deterministically.
    expect(result.failed).toBe(PLAN.scenes.length * 2);
    expect(result.generated).toBe(0);
    expect(result.status).toBe('FAILED');
  });
});
