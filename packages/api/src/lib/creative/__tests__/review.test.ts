import { describe, it, expect, vi } from 'vitest';
import { translateCriticResult, evaluateWithCritic, buildCriticInput } from '../review/criticAdapter';
import { CreativeCriticUnavailableError } from '../../creativeCritic';
import { ReviewService } from '../review/service';
import { buildCreativePlan } from '../production/plan';
import { interpret } from '../intent/interpreter';

const RESULT = {
  overallScore: 72,
  scores: {
    characterIdentity: 80,
    continuity: 60,
    composition: 75,
    lighting: 70,
    emotion: 68,
    visualStyle: 74,
    environment: 71,
    storyAlignment: 77,
    sceneClarity: 73,
    technicalQuality: 66,
  },
  strengths: ['Strong character identity', 'Good story alignment'],
  issues: [
    { category: 'CONTINUITY', severity: 'HIGH', description: 'Hairstyle changes between scene 3 and 4.' },
    { category: 'STYLE', severity: 'MEDIUM', description: 'Visual style drifts toward illustration.' },
  ],
  improvementPlan: {},
  recommendation: 'SUGGEST_REFINEMENT',
  confidence: 82,
} as const;

describe('creative review — critic adapter', () => {
  it('translates critic output into human-readable findings (no scores exposed)', () => {
    const findings = translateCriticResult(RESULT as never, [{ type: 'SCENE', id: 'SCENE_01', name: 'Hook' }]);
    const issue = findings.find((f) => f.id === 'issue-0');
    expect(issue?.category).toBe('CONTINUITY');
    expect(issue?.description).toContain('Continuity');
    expect(issue?.description).toContain('Hairstyle changes');
    expect(issue?.resolution).toBe('REVIEW');
    expect(issue?.raw).toBeDefined(); // diagnostics preserved separately
    const strength = findings.find((f) => f.id === 'strength-0');
    expect(strength?.resolution).toBe('KEEP');
  });

  it('builds a critic input from a produced asset + scene without legacy tables', () => {
    const input = buildCriticInput({ producedAsset: { id: 'a1', assetUrl: 'r2://still' }, sceneId: 'SCENE_01', projectId: 'p1' });
    expect(input.assetId).toBe('a1');
    expect(input.assetUrl).toBe('r2://still');
    expect(input.projectId).toBe('p1');
  });

  it('returns null (graceful) when the critic is unavailable', async () => {
    const evaluator = vi.fn(async () => { throw new CreativeCriticUnavailableError('no key'); });
    const result = await evaluateWithCritic(
      { criticInput: buildCriticInput({ producedAsset: { id: 'a1', assetUrl: 'r2://still' }, sceneId: 'SCENE_01', projectId: 'p1' }), refs: [] },
      evaluator,
    );
    expect(result).toBeNull();
  });
});

describe('creative review — service', () => {
  function prismaMock(plan: any) {
    const runs: any[] = [];
    const prisma: any = {
      creativeProject: {
        findFirst: async () => ({ id: 'p1', userId: 'u1', productionPlan: { plan }, bible: null }),
      },
      creativeProducedAsset: {
        findMany: async () => [
          { id: 'a1', sceneId: 'SCENE_01', assetUrl: 'r2://still', status: 'READY', kind: 'IMAGE' },
          { id: 'a2', sceneId: 'SCENE_02', assetUrl: 'r2://still2', status: 'READY', kind: 'IMAGE' },
        ],
      },
      creativeReviewRun: {
        create: async ({ data }: any) => {
          const run = { id: `run${runs.length + 1}`, createdAt: new Date(), ...data };
          runs.push(run);
          return run;
        },
        update: async ({ where, data }: any) => {
          const run = runs.find((r) => r.id === where.id);
          Object.assign(run, data);
          return run;
        },
        findMany: async () => runs.map((r) => ({ ...r })),
      },
      creativeReviewResolution: { findMany: async () => [] },
      __runs: runs,
    };
    return prisma;
  }

  it('runs review per scene with a fake evaluator and stores human findings', async () => {
    process.env.RAIVSTREAM_5_ENABLED = 'true';
    process.env.RAIVSTREAM_5_REVIEW_ENABLED = 'true';
    const plan = buildCreativePlan({ projectType: interpret('a commercial').projectType });
    const prisma = prismaMock(plan);
    const evaluator = vi.fn(async () => ({ provider: 'fake', model: 'fake', result: { ...RESULT } as unknown as never }));
    const service = new ReviewService();
    const runs = await service.runReview(prisma as never, { projectId: 'p1', userId: 'u1' }, evaluator);
    expect(runs.length).toBe(2);
    expect(runs[0].status).toBe('COMPLETED');
    expect(runs[0].findings.length).toBeGreaterThan(0);
    expect(runs[0].findings.some((f) => f.raw)).toBe(true);
    expect(prisma.__runs.length).toBe(2);
    delete process.env.RAIVSTREAM_5_ENABLED;
    delete process.env.RAIVSTREAM_5_REVIEW_ENABLED;
  });
});