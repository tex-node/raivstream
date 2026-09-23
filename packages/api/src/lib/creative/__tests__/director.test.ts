import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { interpretDirective } from '../director/interpreter';
import { analyzeImpact } from '../director/impact';
import { DirectorService } from '../director/service';
import { buildCreativePlan } from '../production/plan';
import { interpret } from '../intent/interpreter';

beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_DIRECTOR_ENABLED = 'true';
});
afterEach(() => {
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_DIRECTOR_ENABLED;
});

const PLAN = buildCreativePlan({ projectType: interpret('a commercial').projectType });

describe('director interpreter — golden directives', () => {
  it('"make her more confident" → change state, preserve identity, MULTI_SCENE', () => {
    const d = interpretDirective('Make her more confident.', PLAN);
    expect(d.scope).toBe('CHARACTER');
    expect(d.changes[0].field).toBe('state.confidence');
    expect(d.preserves).toContain('character identity');
    expect(d.impact).toBe('MULTI_SCENE');
    expect(d.affectedSceneIndices.length).toBe(PLAN.scenes.length);
  });

  it('"keep everything except the wardrobe" → change wardrobe, preserve everything else', () => {
    const d = interpretDirective('Keep everything except the wardrobe.', PLAN);
    expect(d.changes[0].field).toBe('wardrobe');
    expect(d.preserves).toContain('character identity');
    expect(d.preserves).toContain('world');
  });

  it('"make the ending hopeful" → PROJECT impact on the ending scene', () => {
    const d = interpretDirective('Make the ending hopeful.', PLAN);
    expect(d.changes[0].field).toBe('ending');
    expect(d.impact).toBe('PROJECT');
    expect(d.affectedSceneIndices).toEqual([PLAN.scenes.length - 1]);
  });

  it('"give me three endings" → EXPLORE with 3 variations', () => {
    const d = interpretDirective('Give me three different endings.', PLAN);
    expect(d.mode).toBe('EXPLORE');
    expect(d.exploreCount).toBe(3);
  });

  it('"warm the lighting" → LOCAL single scene', () => {
    const d = interpretDirective('Warm the lighting.', PLAN);
    expect(d.impact).toBe('LOCAL');
    expect(d.affectedSceneIndices.length).toBe(1);
  });

  it('"warm scene 3" resolves to scene index 2', () => {
    const d = interpretDirective('Warm scene 3.', PLAN);
    expect(d.affectedSceneIndices).toEqual([2]);
  });
});

describe('director impact analysis', () => {
  it('normalizes LOCAL single-scene and MULTI_SCENE multi-scene', () => {
    expect(analyzeImpact({ declared: 'LOCAL', sceneIndices: [2], totalScenes: 4 }).impact).toBe('LOCAL');
    expect(analyzeImpact({ declared: 'MULTI_SCENE', sceneIndices: [0, 1], totalScenes: 4 }).impact).toBe('MULTI_SCENE');
    expect(analyzeImpact({ declared: 'MULTI_SCENE', sceneIndices: [1], totalScenes: 4 }).impact).toBe('LOCAL');
    expect(analyzeImpact({ declared: 'PROJECT', sceneIndices: [3], totalScenes: 4 }).impact).toBe('MULTI_SCENE');
  });
});

describe('director service', () => {
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

  it('direct creates a version + directive and NEVER generates', async () => {
    const prisma = prismaMock();
    const service = new DirectorService();
    const { decision, version } = await service.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make her more confident.' });
    expect(decision.creativeChanges[0].field).toBe('state.confidence');
    expect(decision.affectedEntities.some((e) => e.type === 'CHARACTER')).toBe(true);
    expect(Array.isArray(decision.preservedEntities)).toBe(true);
    expect(decision.impact).toBe('MULTI_SCENE');
    expect(version.versionNumber).toBe(1);
    expect(prisma.__versions.length).toBe(1);
    expect(prisma.__directives.length).toBe(1);
    expect(prisma.__deleted.length).toBe(0); // no generation touched
  });

  it('explore creates N versions and preserves the original', async () => {
    const prisma = prismaMock();
    const service = new DirectorService();
    const { versions } = await service.explore(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Give me three different endings.' });
    expect(versions.length).toBe(3);
    expect(versions.map((v) => v.label)).toEqual(['Ending A', 'Ending B', 'Ending C']);
    expect(prisma.__directives[0].mode).toBe('EXPLORE');
  });

  it('apply marks only the affected scenes for regeneration + mutates the plan', async () => {
    const prisma = prismaMock();
    const service = new DirectorService();
    const direct = await service.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make the ending hopeful.' });
    const applied = await service.apply(prisma as never, { projectId: 'p1', userId: 'u1', directiveId: direct.directiveId });
    expect(applied.applied).toBe(true);
    expect(applied.affectedSceneIds).toEqual([PLAN.scenes[PLAN.scenes.length - 1].sceneId]);
    expect(applied.impact).toBe('MULTI_SCENE');
    expect(prisma.__deleted.length).toBe(1);
    expect(prisma.__memories.some((m: any) => m.kind === 'DIRECTION')).toBe(true);
  });
});