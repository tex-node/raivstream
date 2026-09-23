import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCreativeProduction, type ProductionDeps } from '../production/runner';
import { routeProduction, clampH3Duration, type VideoSpec } from '../production/capabilityRouter';
import { buildCreativePlan } from '../production/plan';
import { interpret } from '../intent/interpreter';
import { ProductionPlanService } from '../production/service';
import { CreativeError } from '../shared/errors';

beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_PRODUCTION_ENABLED = 'true';
});
afterEach(() => {
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_PRODUCTION_ENABLED;
});

// ─── Prisma mock (mirrors movieRenderWorker's test approach) ─────────────────

function prismaMock(initial: { project: any; plan: any; bible?: any }) {
  const assets: any[] = [];
  const state = { project: { ...initial.project, productionPlan: { plan: initial.plan } }, statusLog: [] as string[] };
  const prisma: any = {
    creativeProject: {
      findUnique: async () => ({ ...state.project, productionPlan: initial.plan ? { plan: initial.plan } : null, bible: initial.bible ?? null }),
      findFirst: async ({ where }: any) => (where.id === state.project.id ? { ...state.project, productionPlan: initial.plan ? { plan: initial.plan } : null, brief: null, bible: initial.bible ?? null } : null),
      update: async ({ data }: any) => {
        Object.assign(state.project, data);
        if (data.status) state.statusLog.push(data.status);
        return state.project;
      },
    },
    creativeProducedAsset: {
      findMany: async () => assets.map((a) => ({ ...a })),
      create: async ({ data }: any) => {
        const row = { id: `a${assets.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        assets.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const index = assets.findIndex((a) => a.id === where.id);
        assets[index] = { ...assets[index], ...data };
        return assets[index];
      },
    },
    __assets: assets,
    __statusLog: state.statusLog,
  };
  return prisma;
}

const COMMERCIAL = interpret('Create a 60-second cinematic commercial for a new Nigerian premium skincare brand. Make it feel luxurious, confident and modern.');

function makeDeps(overrides?: Partial<ProductionDeps>) {
  const extractCalls: string[] = [];
  const videoSeeds: Array<string | undefined> = [];
  const deps: ProductionDeps = {
    generateStill: vi.fn(async () => ({ assetUrl: 'r2://still' })),
    generateVideo: vi.fn(async (_spec, _projectId, _assetId, seed) => {
      videoSeeds.push(seed);
      return { assetUrl: 'r2://video' };
    }),
    extractLastFrame: vi.fn(async (videoUrl: string) => {
      extractCalls.push(videoUrl);
      return 'r2://lastframe';
    }),
    ...overrides,
  };
  return { deps, extractCalls, videoSeeds };
}

describe('creative production runner', () => {
  it('produces a still + video per scene and moves the project to REVIEW', async () => {
    const plan = buildCreativePlan({ projectType: COMMERCIAL.projectType });
    const prisma = prismaMock({ project: { id: 'p1', userId: 'u1', status: 'APPROVED', projectType: 'COMMERCIAL' }, plan });
    const { deps } = makeDeps();
    const result = await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps);
    expect(result.generated).toBe(plan.scenes.length * 2);
    expect(result.failed).toBe(0);
    expect(prisma.__assets).toHaveLength(plan.scenes.length * 2);
    expect(prisma.__assets.every((a: any) => a.status === 'READY')).toBe(true);
    expect(prisma.__statusLog).toContain('REVIEW');
  });

  it('chains video N from the last frame of video N-1', async () => {
    const plan = buildCreativePlan({ projectType: COMMERCIAL.projectType });
    const prisma = prismaMock({ project: { id: 'p1', userId: 'u1', status: 'APPROVED', projectType: 'COMMERCIAL' }, plan });
    const { deps, extractCalls, videoSeeds } = makeDeps();
    await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps);
    expect(extractCalls.length).toBe(plan.scenes.length - 1); // every scene after the first
    // Scene 2's video is seeded from the previous clip's last frame.
    const scene2Video = videoSeeds[1];
    expect(scene2Video).toBe('r2://lastframe');
    // The first scene's video seeds from its own still.
    expect(videoSeeds[0]).toBe('r2://still');
  });

  it('handles partial failure: one scene fails, others still produce, project reaches REVIEW', async () => {
    const plan = buildCreativePlan({ projectType: COMMERCIAL.projectType });
    const prisma = prismaMock({ project: { id: 'p1', userId: 'u1', status: 'APPROVED', projectType: 'COMMERCIAL' }, plan });
    const { deps } = makeDeps({
      generateStill: vi.fn(async (spec: any) => {
        if (spec.sceneId === 'SCENE_02') throw new Error('provider rejected');
        return { assetUrl: 'r2://still' };
      }),
    });
    const result = await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps);
    expect(result.failed).toBe(1);
    const failedAsset = prisma.__assets.find((a: any) => a.status === 'FAILED');
    expect(failedAsset?.sceneId).toBe('SCENE_02');
    expect(failedAsset?.kind).toBe('IMAGE');
    expect(failedAsset?.errorMessage).toContain('provider rejected');
    expect(prisma.__assets.filter((a: any) => a.status === 'READY').length).toBe(plan.scenes.length * 2 - 1);
    expect(prisma.__statusLog).toContain('REVIEW');
  });

  it('is resumable: skips READY assets on re-run', async () => {
    const plan = buildCreativePlan({ projectType: COMMERCIAL.projectType });
    const prisma = prismaMock({ project: { id: 'p1', userId: 'u1', status: 'GENERATING', projectType: 'COMMERCIAL' }, plan });
    const { deps, videoSeeds } = makeDeps();
    await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps);
    const firstRunVideoCalls = videoSeeds.length;
    const { deps: deps2, videoSeeds: videoSeeds2 } = makeDeps();
    await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps2);
    expect(videoSeeds2.length).toBeLessThan(firstRunVideoCalls);
    expect(prisma.__assets).toHaveLength(plan.scenes.length * 2);
  });
});

describe('creative capability router + approval gate', () => {
  it('routes one IMAGE + one VIDEO per scene with H3-clamped durations', () => {
    const plan = buildCreativePlan({ projectType: COMMERCIAL.projectType });
    const specs = routeProduction(plan);
    expect(specs).toHaveLength(plan.scenes.length * 2);
    expect(specs.every((s) => s.kind === 'IMAGE' || s.kind === 'VIDEO')).toBe(true);
    for (const scene of plan.scenes) {
      const video = specs.find((s) => s.kind === 'VIDEO' && s.sceneId === scene.sceneId) as VideoSpec | undefined;
      expect(video && clampH3Duration(video.durationSeconds)).toBeLessThanOrEqual(15);
    }
  });

  it('routes production for story and education plans too', () => {
    const story = buildCreativePlan({ projectType: interpret('a short film about a woman returning home').projectType });
    const education = buildCreativePlan({ projectType: interpret('a lesson explaining photosynthesis to eight-year-olds').projectType });
    expect(routeProduction(story).length).toBe(story.scenes.length * 2);
    expect(routeProduction(education).length).toBe(education.scenes.length * 2);
  });

  it('unapproved projects cannot enter production', async () => {
    const plan = buildCreativePlan({ projectType: COMMERCIAL.projectType });
    const prisma = prismaMock({ project: { id: 'p1', userId: 'u1', status: 'PREVIEW', projectType: 'COMMERCIAL' }, plan });
    const service = new ProductionPlanService();
    await expect(service.produce(prisma as never, { projectId: 'p1', userId: 'u1' })).rejects.toMatchObject({ code: 'PLAN_NOT_APPROVED' });
  });

  it('projects without a plan cannot enter production', async () => {
    const prisma = prismaMock({ project: { id: 'p1', userId: 'u1', status: 'APPROVED', projectType: 'COMMERCIAL' }, plan: null });
    const service = new ProductionPlanService();
    await expect(service.produce(prisma as never, { projectId: 'p1', userId: 'u1' })).rejects.toMatchObject({ code: 'PLAN_NOT_APPROVED' });
  });

  it('approved projects start production and move to GENERATING', async () => {
    const plan = buildCreativePlan({ projectType: COMMERCIAL.projectType });
    const prisma = prismaMock({ project: { id: 'p1', userId: 'u1', status: 'APPROVED', projectType: 'COMMERCIAL' }, plan });
    const service = new ProductionPlanService();
    const result = await service.produce(prisma as never, { projectId: 'p1', userId: 'u1' });
    expect(result).toEqual({ started: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(prisma.__statusLog[0]).toBe('GENERATING');
  });
});