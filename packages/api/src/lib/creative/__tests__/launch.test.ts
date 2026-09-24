import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildRunDiagnostics } from '../production/diagnostics';
import { runCreativeProduction, type ProductionDeps } from '../production/runner';
import { buildCreativePlan } from '../production/plan';
import { interpret } from '../intent/interpreter';

beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_PRODUCTION_ENABLED = 'true';
});
afterEach(() => {
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_PRODUCTION_ENABLED;
});

const PLAN = buildCreativePlan({ projectType: interpret('a commercial').projectType });

// ─── Gate 2 — data & provenance diagnostics ──────────────────────────────────

describe('launch — production run diagnostics', () => {
  function prismaMock() {
    const project = {
      id: 'p1', userId: 'u1', status: 'REVIEW', currentVersionId: 'v1', seriesId: 's1', campaignId: 'c1',
      productionPlan: { version: 2, plan: PLAN }, bible: { version: 1, characters: [{ name: 'Amara' }] },
    };
    return {
      creativeProject: { findFirst: async () => project },
      creativeProducedAsset: {
        findMany: async () => [
          { id: 'a1', sceneId: 'SCENE_01', kind: 'IMAGE', status: 'READY', provider: 'internal', errorMessage: null },
          { id: 'a2', sceneId: 'SCENE_01', kind: 'VIDEO', status: 'FAILED', provider: 'internal', errorMessage: 'provider rejected the request' },
        ],
      },
      creativeProductionRun: {
        findFirst: async () => ({ id: 'r1', status: 'PARTIAL', attempt: 2, stage: 'ready', startedAt: new Date(), heartbeatAt: new Date(), finishedAt: new Date(), lastError: 'Some scenes could not be generated.' }),
      },
      creativeVersion: { findMany: async () => [{ id: 'v1', versionNumber: 1, label: 'Direct: warm lighting', createdAt: new Date() }] },
      creativeDirective: { findMany: async () => [{ id: 'd1', mode: 'DIRECT', instruction: 'Warm scene 1.', impact: 'LOCAL', createdAt: new Date() }] },
      creativeReviewRun: { findMany: async () => [{ id: 'rr1', status: 'COMPLETED', sceneId: 'SCENE_01', findings: [{ id: 'f1' }] }] },
      creativeApproval: { findMany: async () => [{ versionId: 'v1', kind: 'CREATIVE', status: 'APPROVED' }] },
      creativeOutput: { findMany: async () => [{ id: 'o1', versionId: 'v1', format: 'LANDSCAPE', status: 'READY', errorMessage: null }] },
    } as never;
  }

  it('returns the full provenance chain and sanitized failures', async () => {
    const d = await buildRunDiagnostics(prismaMock(), { projectId: 'p1', userId: 'u1' });
    expect(d.provenance.seriesId).toBe('s1');
    expect(d.provenance.campaignId).toBe('c1');
    expect(d.provenance.versions[0].versionNumber).toBe(1);
    expect(d.provenance.directives[0].instruction).toBe('Warm scene 1.');
    expect(d.provenance.reviewRuns[0].findings).toBe(1);
    expect(d.provenance.approvals[0].status).toBe('APPROVED');
    expect(d.provenance.outputs[0].status).toBe('READY');
    expect(d.run?.status).toBe('PARTIAL');
    expect(d.summary.healthy).toBe(false);
    expect(d.failures[0].message).toContain('provider rejected');
    expect(d.scenes.find((s) => s.sceneId === 'SCENE_01')?.status).toBe('FAILED');
  });

  it('never exposes raw provider/model/prompt internals', async () => {
    const d = await buildRunDiagnostics(prismaMock(), { projectId: 'p1', userId: 'u1' });
    const serialized = JSON.stringify(d);
    expect(serialized).not.toContain('fal.ai');
    expect(serialized).not.toContain('minimax');
    expect(serialized).not.toContain('flux');
    expect(serialized).not.toContain('H3_MAX');
    expect(serialized).not.toContain('prompt');
    expect(serialized).not.toContain('http');
    expect(d.scenes[0].assets.every((a) => a.provider === null || a.provider === 'internal')).toBe(true);
  });
});

// ─── Gate 1 — reliability: a failure affects the smallest possible scope ─────

describe('launch — reliability failure matrix', () => {
  function prismaMock() {
    const assets: any[] = [];
    const project = { id: 'p1', userId: 'u1', status: 'APPROVED', projectType: 'COMMERCIAL' };
    return {
      prisma: {
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
      } as never,
      assets,
    };
  }

  function deps(overrides?: Partial<ProductionDeps>): ProductionDeps {
    return {
      generateStill: vi.fn(async () => ({ assetUrl: 'r2://still' })),
      generateVideo: vi.fn(async () => ({ assetUrl: 'r2://video' })),
      extractLastFrame: vi.fn(async () => 'r2://lastframe'),
      ...overrides,
    };
  }

  it('provider timeout fails only the timed-out asset and the run continues', async () => {
    const { prisma, assets } = prismaMock();
    const still = vi.fn(async (spec: any) => {
      if (spec.sceneId === 'SCENE_02') throw new Error('Generation is taking longer than expected. Please try again.');
      return { assetUrl: 'r2://still' };
    });
    const result = await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps({ generateStill: still }), { maxAttempts: 1 });
    expect(result.failed).toBe(1);
    expect(result.generated).toBe(PLAN.scenes.length * 2 - 1);
    expect(result.status).toBe('PARTIAL');
    expect(assets.find((a) => a.status === 'FAILED')?.sceneId).toBe('SCENE_02');
    // Every other scene still produced.
    expect(assets.filter((a) => a.status === 'READY').length).toBe(PLAN.scenes.length * 2 - 1);
  });

  it('storage (R2) failure fails only that asset and never corrupts others', async () => {
    const { prisma, assets } = prismaMock();
    const video = vi.fn(async (spec: any) => {
      if (spec.sceneId === 'SCENE_01') throw new Error('R2 upload failed');
      return { assetUrl: 'r2://video' };
    });
    const result = await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps({ generateVideo: video }), { maxAttempts: 1 });
    expect(result.failed).toBe(1);
    const failed = assets.find((a) => a.status === 'FAILED');
    expect(failed?.sceneId).toBe('SCENE_01');
    expect(failed?.kind).toBe('VIDEO');
    expect(assets.filter((a) => a.status === 'READY').length).toBe(PLAN.scenes.length * 2 - 1);
  });

  it('repeated retry is bounded and does not loop forever', async () => {
    const { prisma } = prismaMock();
    const still = vi.fn(async () => { throw new Error('provider rejected'); });
    const result = await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps({ generateStill: still }), { maxAttempts: 2 });
    // 1 image per scene × 2 attempts (bounded) — never unbounded.
    expect(still).toHaveBeenCalledTimes(PLAN.scenes.length * 2);
    // Image fails → no byKey still entry → VIDEO has no seed → also fails deterministically.
    expect(result.failed).toBe(PLAN.scenes.length * 2);
    expect(result.generated).toBe(0);
    expect(result.status).toBe('FAILED');
  });

  it('a fully failed run is FAILED, not COMPLETED', async () => {
    const { prisma } = prismaMock();
    const failing = vi.fn(async () => { throw new Error('provider down'); });
    const result = await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps({ generateStill: failing, generateVideo: failing }), { maxAttempts: 1 });
    expect(result.status).toBe('FAILED');
    expect(result.generated).toBe(0);
  });
});
