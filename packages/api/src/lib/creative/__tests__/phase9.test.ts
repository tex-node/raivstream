import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspaceStageFor, workspaceProgressFor } from '../project/state';
import { deriveProductionStages } from '../production/stages';
import { buildProductionContext, contextPromptLine } from '../production/contextAdapter';
import { buildCreativePlan } from '../production/plan';
import { routeProduction } from '../production/capabilityRouter';
import { DirectorService } from '../director/service';
import { translateCriticResult } from '../review/criticAdapter';
import { ProductionPlanService } from '../production/service';
import { ProjectService } from '../project/service';
import { runCreativeProduction, recoverStuckProductions, type ProductionDeps } from '../production/runner';
import { creativeMetricsSnapshot, recordCreativeTiming, resetCreativeTimings, timedCreative } from '../observability/metrics';
import { interpret } from '../intent/interpreter';

beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_PRODUCTION_ENABLED = 'true';
  process.env.RAIVSTREAM_5_DIRECTOR_ENABLED = 'true';
  process.env.RAIVSTREAM_5_PREVIEW_ENABLED = 'true';
});
afterEach(() => {
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_PRODUCTION_ENABLED;
  delete process.env.RAIVSTREAM_5_DIRECTOR_ENABLED;
  delete process.env.RAIVSTREAM_5_PREVIEW_ENABLED;
});

const COMMERCIAL = interpret('Create a 60-second cinematic commercial for a new Nigerian premium skincare brand.');
const PLAN = buildCreativePlan({ projectType: COMMERCIAL.projectType });

// ─── 1. Progressive disclosure ───────────────────────────────────────────────

describe('phase 9 — progressive disclosure', () => {
  it('derives the single creator-facing stage from the technical status', () => {
    expect(workspaceStageFor('IDEA', false, false, false)).toBe('UNDERSTAND');
    expect(workspaceStageFor('PLANNING', true, false, false)).toBe('UNDERSTAND');
    expect(workspaceStageFor('PLANNING', true, true, false)).toBe('PLAN');
    expect(workspaceStageFor('PREVIEW', true, true, false)).toBe('PREVIEW');
    expect(workspaceStageFor('GENERATING', true, true, true)).toBe('PRODUCE');
    expect(workspaceStageFor('REVIEW', true, true, true)).toBe('REVIEW');
    expect(workspaceStageFor('APPROVED', true, true, true)).toBe('DELIVER');
  });

  it('reports completed stages and advanced-detail availability', () => {
    const progress = workspaceProgressFor('REVIEW', true, true, true);
    expect(progress.label).toBe('Your film is ready');
    expect(progress.completed).toContain('PRODUCE');
    expect(progress.hasBible).toBe(true);
    expect(progress.hasPlan).toBe(true);
    expect(progress.hasVersion).toBe(true);
  });
});

// ─── 2. Production feels alive ───────────────────────────────────────────────

describe('phase 9 — production stage checklist', () => {
  const base = { hasPlan: true, hasBible: true, hasCharacters: true, failed: 0, expected: 8 } as const;

  it('names the scene being created and reports real progress dimensions', () => {
    const { stage, stages } = deriveProductionStages({ ...base, projectStatus: 'GENERATING', ready: 2, generating: 2, currentSceneIndex: 1 });
    expect(stage).toBe('creating_scenes');
    const creating = stages.find((entry) => entry.id === 'creating_scenes')!;
    expect(creating.label).toBe('Creating Scene 2');
    expect(creating.state).toBe('active');
    expect(stages.find((entry) => entry.id === 'understanding')!.state).toBe('done');
  });

  it('moves to checking continuity when all scenes are ready, then finalizing at review', () => {
    const allReady = deriveProductionStages({ ...base, projectStatus: 'GENERATING', ready: 8, generating: 0, currentSceneIndex: 3 });
    expect(allReady.stage).toBe('checking_continuity');
    expect(allReady.stages.find((entry) => entry.id === 'creating_scenes')!.state).toBe('done');
    const review = deriveProductionStages({ ...base, projectStatus: 'REVIEW', ready: 8, generating: 0, currentSceneIndex: 3 });
    expect(review.stage).toBe('finalizing');
    expect(review.stages.find((entry) => entry.id === 'finalizing')!.state).toBe('active');
  });
});

// ─── 3. Context pipeline ("Raivstream remembered") ───────────────────────────

describe('phase 9 — context pipeline', () => {
  const bible = {
    version: 1,
    brand: { name: 'Glow', tone: 'luxurious', approvedMessaging: ['Feel the glow'] },
    canon: { storyRules: ['Family first'] },
    visualLanguage: { style: 'cinematic' },
    characters: [],
  } as never;

  it('assembles studio context from the inherited bible', () => {
    const context = buildProductionContext({ brief: { originalIntent: 'x', audience: 'young professionals' } as never, bible });
    expect(context.source).toBe('STUDIO');
    expect(context.brandName).toBe('Glow');
    expect(context.audience).toBe('young professionals');
    expect(context.storyRules).toContain('Family first');
    const line = contextPromptLine(context);
    expect(line).toContain('brand Glow');
    expect(line).toContain('young professionals');
  });

  it('reads the studio-seeded brand shape (brandIdentity.name) used by campaign projects', () => {
    const seeded = { version: 1, brand: { brandIdentity: { name: 'Voltaic Noir' }, approvedMessaging: ['Night belongs to you'], product: 'Radiance Serum' }, visualLanguage: { style: 'noir cinematic' } } as never;
    const context = buildProductionContext({ bible: seeded });
    expect(context.source).toBe('STUDIO');
    expect(context.brandName).toBe('Voltaic Noir');
    expect(context.approvedMessaging).toContain('Night belongs to you');
    expect(contextPromptLine(context)).toContain('Voltaic Noir');
  });

  it('recognizes series context from canon alone', () => {
    const context = buildProductionContext({ bible: { version: 1, canon: { world: { name: 'Lagos' } } } as never });
    expect(context.source).toBe('SERIES');
  });

  it('snapshots context into the plan and carries it into generation prompts', () => {
    const context = buildProductionContext({ brief: { originalIntent: 'x', audience: 'young professionals' } as never, bible });
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', context });
    expect(plan.contextSnapshot?.brandName).toBe('Glow');
    const specs = routeProduction(plan, bible, context);
    expect(specs[0].prompt).toContain('Glow');
  });
});

// ─── 4. Direct is the dominant interaction ───────────────────────────────────

describe('phase 9 — director propose + applyInstruction', () => {
  function prismaMock() {
    const versions: any[] = [];
    const directives: any[] = [];
    const memories: any[] = [];
    const deleted: string[] = [];
    const project = { id: 'p1', userId: 'u1', projectType: 'COMMERCIAL', title: 'Skincare', status: 'REVIEW', currentVersionId: null };
    const bible = { version: 1, characters: [{ name: 'Amara', visualDescription: 'confident, elegant' }], worlds: [] };
    const prisma: any = {
      creativeProject: {
        findFirst: async () => ({ ...project, productionPlan: { plan: PLAN }, bible }),
        update: async ({ data }: any) => { Object.assign(project, data); return project; },
      },
      creativeVersion: {
        findFirst: async () => versions[versions.length - 1] ?? null,
        create: async ({ data }: any) => { const v = { id: `v${versions.length + 1}`, createdAt: new Date(), ...data }; versions.push(v); return v; },
      },
      creativeDirective: { create: async ({ data }: any) => { const d = { id: `d${directives.length + 1}`, createdAt: new Date(), ...data }; directives.push(d); return d; }, findFirst: async () => directives[directives.length - 1] ?? null },
      creativeMemory: { create: async ({ data }: any) => { memories.push(data); return { id: 'm1' }; } },
      creativeBible: { upsert: async ({ update }: any) => ({ id: 'b1', ...update }) },
      creativeApproval: { updateMany: async () => ({ count: 0 }) },
      creativeProductionPlan: { upsert: async ({ update }: any) => ({ id: 'plan1', ...update }) },
      creativeProducedAsset: { deleteMany: async ({ where }: any) => { deleted.push(JSON.stringify(where)); return { count: 1 }; } },
      __versions: versions, __directives: directives, __memories: memories, __deleted: deleted,
    };
    return prisma;
  }

  it('propose understands change/preserve/impact without persisting anything', async () => {
    const prisma = prismaMock();
    const { decision } = await new DirectorService().propose(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make her more confident.' });
    expect(decision.creativeChanges[0].field).toBe('state.confidence');
    expect(decision.preservedEntities.length).toBeGreaterThanOrEqual(0);
    expect(decision.impact).toBe('MULTI_SCENE');
    expect(prisma.__versions.length).toBe(0);
    expect(prisma.__directives.length).toBe(0);
  });

  it('applyInstruction proposes, snapshots and regenerates only affected scenes', async () => {
    const prisma = prismaMock();
    const applied = await new DirectorService().applyInstruction(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make the ending hopeful.' });
    expect(applied.applied).toBe(true);
    expect(applied.affectedSceneIds).toEqual([PLAN.scenes[PLAN.scenes.length - 1].sceneId]);
    expect(prisma.__versions.length).toBe(1);
    expect(prisma.__directives.length).toBe(1);
    expect(prisma.__deleted.length).toBe(1);
  });
});

// ─── 5. Closed Review → Director loop ────────────────────────────────────────

describe('phase 9 — review findings are Director-ready', () => {
  const RESULT = {
    overallScore: 72,
    scores: {},
    strengths: [],
    issues: [{ category: 'CONTINUITY', severity: 'HIGH', description: 'Hairstyle changes between Scenes 3 and 4.' }],
    improvementPlan: {},
    recommendation: 'SUGGEST_REFINEMENT',
    confidence: 82,
  } as never;

  it('proposes a correction, what it preserves, and the expected impact', () => {
    const findings = translateCriticResult(RESULT, [{ type: 'SCENE', id: 'SCENE_04', name: 'Resolution' }]);
    const issue = findings.find((finding) => finding.id === 'issue-0')!;
    expect(issue.suggestedFixInstruction).toContain('continuity');
    expect(issue.suggestedFixInstruction).toContain('Resolution');
    expect(issue.suggestedPreserves).toContain('wardrobe');
    expect(issue.suggestedImpact).toBe('LOCAL');
  });
});

// ─── 6. Reliability: durable runs, retry, recovery ───────────────────────────

describe('phase 9 — durable production runs', () => {
  function runPrisma(initial: { projectStatus?: string; heartbeatAt?: Date; inFlight?: number; plan?: any }) {
    const runs: any[] = initial.heartbeatAt ? [{ id: 'run-existing', projectId: 'p1', status: 'RUNNING', heartbeatAt: initial.heartbeatAt, startedAt: initial.heartbeatAt }] : [];
    const assets: any[] = [];
    if (initial.inFlight) for (let i = 0; i < initial.inFlight; i += 1) assets.push({ id: `inflight${i}`, sceneId: 'SCENE_01', kind: 'IMAGE', status: 'GENERATING' });
    const project = { id: 'p1', userId: 'u1', status: initial.projectStatus ?? 'APPROVED', projectType: 'COMMERCIAL' };
    const prisma: any = {
      creativeProject: {
        findUnique: async () => ({ ...project, productionPlan: { plan: initial.plan ?? PLAN }, bible: null }),
        findFirst: async () => ({ ...project, productionPlan: { plan: initial.plan ?? PLAN }, brief: null, bible: null }),
        findMany: async () => (project.status === 'GENERATING' ? [{ ...project }] : []),
        update: async ({ data }: any) => { Object.assign(project, data); return project; },
      },
      creativeProducedAsset: {
        findMany: async () => assets.map((asset) => ({ ...asset })),
        count: async () => assets.filter((asset) => asset.status === 'GENERATING').length,
        create: async ({ data }: any) => { const row = { id: `a${assets.length + 1}`, createdAt: new Date(), ...data }; assets.push(row); return row; },
        update: async ({ where, data }: any) => { const row = assets.find((asset) => asset.id === where.id); Object.assign(row, data); return row; },
        deleteMany: async () => ({ count: 0 }),
      },
      creativeProductionRun: {
        create: async ({ data }: any) => { const run = { id: `run${runs.length + 1}`, startedAt: new Date(), ...data }; runs.push(run); return run; },
        update: async ({ where, data }: any) => { const run = runs.find((row) => row.id === where.id); Object.assign(run, data); return run; },
        findFirst: async () => runs[runs.length - 1] ?? null,
      },
      creativeVersion: { findFirst: async () => null, create: async ({ data }: any) => ({ id: 'v1', ...data }) },
      creativeDirective: { create: async ({ data }: any) => ({ id: 'd1', ...data }), findFirst: async () => null },
      creativeApproval: { updateMany: async () => ({ count: 0 }), findUnique: async () => null },
      creativeProductionPlan: { upsert: async ({ update }: any) => ({ id: 'plan1', ...update }) },
      creativeBible: { upsert: async ({ update }: any) => ({ id: 'b1', ...update }) },
      creativeMemory: { create: async () => ({ id: 'm1' }) },
      __runs: runs, __assets: assets,
    };
    return prisma;
  }

  function deps(overrides?: Partial<ProductionDeps>): ProductionDeps {
    return {
      generateStill: vi.fn(async () => ({ assetUrl: 'r2://still' })),
      generateVideo: vi.fn(async () => ({ assetUrl: 'r2://video' })),
      extractLastFrame: vi.fn(async () => 'r2://lastframe'),
      ...overrides,
    };
  }

  it('creates a durable run, heartbeats it and finalizes COMPLETED', async () => {
    const prisma = runPrisma({ projectStatus: 'GENERATING' });
    const result = await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps());
    expect(result.status).toBe('COMPLETED');
    expect(prisma.__runs.length).toBe(1);
    expect(prisma.__runs[0].status).toBe('COMPLETED');
    expect(prisma.__runs[0].finishedAt).toBeTruthy();
  });

  it('retries transient provider failures in-run without user action', async () => {
    const prisma = runPrisma({ projectStatus: 'GENERATING' });
    let calls = 0;
    const still = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient provider error');
      return { assetUrl: 'r2://still' };
    });
    const result = await runCreativeProduction(prisma as never, { projectId: 'p1' }, deps({ generateStill: still }), { maxAttempts: 2 });
    expect(result.failed).toBe(0);
    expect(result.generated).toBe(PLAN.scenes.length * 2);
  });

  it('allows refinement production from REVIEW (post-direct regeneration)', async () => {
    const prisma = runPrisma({ projectStatus: 'REVIEW' });
    const result = await new ProductionPlanService().produce(prisma as never, { projectId: 'p1', userId: 'u1' });
    expect(result.started).toBe(true);
    expect(prisma.__runs.length).toBe(1);
  });

  it('produce is idempotent while a run is active', async () => {
    const prisma = runPrisma({ projectStatus: 'GENERATING', heartbeatAt: new Date() });
    // Project status is GENERATING → already running (no new run started).
    const result = await new ProductionPlanService().produce(prisma as never, { projectId: 'p1', userId: 'u1' });
    expect(result).toEqual({ started: false, reason: 'already_running' });
    expect(prisma.__runs.length).toBe(1);
  });

  it('recovers a stale run after a process restart but leaves active runs alone', async () => {
    const stale = runPrisma({ projectStatus: 'GENERATING', heartbeatAt: new Date(Date.now() - 10 * 60 * 1000) });
    const recovered = await recoverStuckProductions(stale as never, deps(), { staleMs: 60 * 1000 });
    expect(recovered.recovered).toContain('p1');

    const active = runPrisma({ projectStatus: 'GENERATING', heartbeatAt: new Date(), inFlight: 1 });
    const result = await recoverStuckProductions(active as never, deps(), { staleMs: 5 * 60 * 1000 });
    expect(result.alreadyActive).toContain('p1');
    expect(result.recovered).toHaveLength(0);
  });
});

// ─── 7. Approval-state consistency ───────────────────────────────────────────

describe('phase 9 — approval-state consistency', () => {
  function projectPrisma(status: string) {
    const project = { id: 'p1', userId: 'u1', title: 'x', projectType: 'STORY', status, legacyStoryProjectId: null, currentVersionId: null, createdAt: new Date(), updatedAt: new Date() };
    return {
      creativeProject: {
        findFirst: async () => ({ ...project, brief: null, bible: null, productionPlan: null }),
        update: async ({ data }: any) => { Object.assign(project, data); return { ...project, brief: null, bible: null, productionPlan: null }; },
      },
    } as never;
  }

  it('planning owns the transition into PREVIEW', async () => {
    const updates: any[] = [];
    const prisma: any = {
      creativeProject: {
        findFirst: async () => ({ id: 'p1', userId: 'u1', projectType: 'COMMERCIAL', title: 'x', brief: null, bible: null, productionPlan: null }),
        update: async ({ data }: any) => { updates.push(data); return {}; },
      },
      creativeProductionPlan: { create: async () => ({ id: 'pl1' }) },
    };
    await new ProductionPlanService().plan(prisma as never, { projectId: 'p1', userId: 'u1' });
    expect(updates.some((entry) => entry.status === 'PREVIEW')).toBe(true);
  });

  it('rejects an impossible status transition and allows a valid one', async () => {
    const service = new ProjectService();
    await expect(service.updateStatus(projectPrisma('PREVIEW'), { projectId: 'p1', userId: 'u1', status: 'GENERATING' })).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    const ok = await service.updateStatus(projectPrisma('PREVIEW'), { projectId: 'p1', userId: 'u1', status: 'APPROVED' });
    expect(ok.status).toBe('APPROVED');
  });
});

// ─── 8. Performance measurement ──────────────────────────────────────────────

describe('phase 9 — creative observability', () => {
  it('records timings with failures and computes a summary', async () => {
    resetCreativeTimings();
    recordCreativeTiming('intent.interpret', 10);
    recordCreativeTiming('intent.interpret', 30, false);
    const snapshot = creativeMetricsSnapshot();
    const label = snapshot.labels.find((entry) => entry.label === 'intent.interpret')!;
    expect(label.count).toBe(2);
    expect(label.failures).toBe(1);
    expect(label.avgMs).toBe(20);

    await expect(timedCreative('x', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(creativeMetricsSnapshot().labels.some((entry) => entry.label === 'x' && entry.failures === 1)).toBe(true);
    resetCreativeTimings();
  });
});
