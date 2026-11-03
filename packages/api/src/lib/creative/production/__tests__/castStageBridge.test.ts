import { describe, expect, it, vi } from 'vitest';
import { assertCastApproved, castReferences, resolveCreativeReferences } from '../identityBlock';

/**
 * The four free proofs for the bridge (2026-11-02).
 *
 * Each one guards a specific way the cast stage could spend ~1,120 credits to learn that
 * nothing was conditioned: rows resolution cannot see, a gate that lets production through,
 * a regenerated reference, or a missing READY row.
 */

const characters = [
  { name: 'Lighthouse Keeper', visualDescription: 'a weathered man in a yellow oilskin' },
  { name: 'Lost Bird', visualDescription: 'a small grey seabird with a banded leg' },
];

function castPrisma(existing: Array<{ id: string }> = []) {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  let findFirstCalls = 0;
  const prisma = {
    characterReferenceAsset: {
      findFirst: vi.fn(async () => {
        findFirstCalls += 1;
        return existing[findFirstCalls - 1] ?? null;
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: `ref_${created.length}` };
      }),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return {};
      }),
      findMany: vi.fn(async () => []),
    },
  };
  return { prisma: prisma as never, created, updates, prismaRaw: prisma };
}

describe('proof 1: one READY reference per derived character', () => {
  it('creates a row per character and marks each READY with a url', async () => {
    const { prisma, created, updates } = castPrisma();
    const generate = vi.fn(async () => 'https://cdn/ref.png');
    const result = await castReferences(prisma, { projectId: 'proj_1', characters, generate });

    expect(created).toHaveLength(2);
    expect(created.map((row) => row.characterName)).toEqual(['Lighthouse Keeper', 'Lost Bird']);
    // projectId is the creative project - the whole point of the bridge
    expect(created.every((row) => row.projectId === 'proj_1')).toBe(true);
    expect(created.every((row) => row.characterId === undefined)).toBe(true);
    expect(updates).toHaveLength(2);
    expect(updates.every((row) => row.status === 'READY' && row.assetUrl === 'https://cdn/ref.png')).toBe(true);
    expect(result.created.map((c) => c.name)).toEqual(['Lighthouse Keeper', 'Lost Bird']);
  });
});

describe('proof 2: the resolver sees a characterName-matched row with no characterId', () => {
  it('queries both branches and de-duplicates by url', async () => {
    const findMany = vi.fn(async () => [
      { assetUrl: 'https://cdn/keeper.png' },
      { assetUrl: 'https://cdn/keeper.png' }, // matched BOTH branches
      { assetUrl: 'https://cdn/bird.png' },
    ]);
    const prisma = { characterReferenceAsset: { findMany } } as never;
    const urls = await resolveCreativeReferences(prisma, [{ name: 'Lighthouse Keeper' }]);

    expect(urls).toEqual(['https://cdn/keeper.png', 'https://cdn/bird.png']);
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    // the bridge itself: a relation-only match would never see a creative-owned row
    expect(where.OR).toEqual([
      { character: { name: { in: ['Lighthouse Keeper'] } } },
      { characterName: { in: ['Lighthouse Keeper'] } },
    ]);
  });
});

describe('proof 3: production refuses until every cast character is approved', () => {
  it('throws with the unapproved characters named', async () => {
    const prisma = {
      characterReferenceAsset: {
        findMany: async () => [{ characterName: 'Lighthouse Keeper' }],
      },
    } as never;
    await expect(assertCastApproved(prisma, { projectId: 'p', characters })).rejects.toThrow(/CAST_NOT_APPROVED.*Lost Bird/);
  });

  it('passes when every character is approved', async () => {
    const prisma = {
      characterReferenceAsset: {
        findMany: async () => [{ characterName: 'Lighthouse Keeper' }, { characterName: 'Lost Bird' }],
      },
    } as never;
    await expect(assertCastApproved(prisma, { projectId: 'p', characters })).resolves.toBeUndefined();
  });

  it('a cast with no characters does not block production', async () => {
    const prisma = { characterReferenceAsset: { findMany: async () => [] } } as never;
    await expect(assertCastApproved(prisma, { projectId: 'p', characters: [] })).resolves.toBeUndefined();
  });
});

describe('proof 4: an existing READY reference is not regenerated', () => {
  it('skips the character and never calls the provider', async () => {
    const { prisma, created } = castPrisma([{ id: 'existing' }]);
    const generate = vi.fn(async () => 'https://cdn/new.png');
    const result = await castReferences(prisma, { projectId: 'proj_1', characters, generate });

    // first character found existing, second did not
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.skipped).toEqual([{ name: 'Lighthouse Keeper', reason: 'already_ready' }]);
    expect(created.map((row) => row.characterName)).toEqual(['Lost Bird']);
  });
});
describe('the gate is wired into the production path, not just exported', () => {
  // The production service is flag-gated, so the wired path is only reached with it open.
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_PRODUCTION_ENABLED = 'true';

  const projectRow = (bible: unknown) => ({
    id: 'p1',
    userId: 'u1',
    status: 'APPROVED',
    projectType: 'STORY',
    productionPlan: { plan: { scenes: [] } },
    brief: null,
    bible,
  });

  function producePrisma(bible: unknown, approved: Array<{ characterName: string }>) {
    const prisma: any = {
      creativeProject: { findFirst: async () => projectRow(bible) },
      characterReferenceAsset: { findMany: async () => approved },
      creativeProductionRun: { findFirst: async () => null, create: async () => ({ id: 'run1' }) },
      creativeProducedAsset: { findMany: async () => [], count: async () => 0, updateMany: async () => ({ count: 0 }) },
    };
    return prisma;
  }

  it('produce() refuses a real production while a cast reference is unapproved', async () => {
    const { ProductionPlanService } = await import('../service');
    const prisma = producePrisma({ characters: [{ name: 'Lighthouse Keeper' }] }, []);
    await expect(
      new ProductionPlanService().produce(prisma, { projectId: 'p1', userId: 'u1' }),
    ).rejects.toThrow(/CAST_NOT_APPROVED.*Lighthouse Keeper/);
  });

  it('produce() passes the gate once every cast character is approved', async () => {
    const { ProductionPlanService } = await import('../service');
    const prisma = producePrisma({ characters: [{ name: 'Lighthouse Keeper' }] }, [{ characterName: 'Lighthouse Keeper' }]);
    // It may fail later on an incomplete stub; the assertion is that the failure is NOT the gate.
    await expect(
      new ProductionPlanService().produce(prisma, { projectId: 'p1', userId: 'u1' }),
    ).rejects.not.toThrow(/CAST_NOT_APPROVED/).catch(() => undefined);
    let gateError: unknown = null;
    try {
      await new ProductionPlanService().produce(prisma, { projectId: 'p1', userId: 'u1' });
    } catch (error) {
      gateError = error;
    }
    expect(String((gateError as Error)?.message ?? '')).not.toMatch(/CAST_NOT_APPROVED/);
  });

  it('a project with no cast is not blocked', async () => {
    const { ProductionPlanService } = await import('../service');
    const prisma = producePrisma({ characters: [] }, []);
    let gateError: unknown = null;
    try {
      await new ProductionPlanService().produce(prisma, { projectId: 'p1', userId: 'u1' });
    } catch (error) {
      gateError = error;
    }
    expect(String((gateError as Error)?.message ?? '')).not.toMatch(/CAST_NOT_APPROVED/);
  });
});

describe('the gate is ABOVE the early returns (the placement bug)', () => {
  // Production evidence: project stuck in GENERATING returned already_running and never
  // reached the gate, so production did not refuse while the unit test passed. A gate an
  // earlier return can skip is not blocking. This test constructs exactly that state.
  function prismaFor(status: string, approved: string[]) {
    const prisma: any = {
      creativeProject: {
        findFirst: async () => ({ id: 'p1', userId: 'u1', status, projectType: 'STORY', productionPlan: { plan: { scenes: [] } }, brief: null, bible: { characters: [{ name: 'Lighthouse Keeper' }] } }),
      },
      characterReferenceAsset: { findMany: async () => approved.map((characterName) => ({ characterName })) },
      creativeProductionRun: { findFirst: async () => null, create: async () => ({ id: 'run1' }) },
      creativeProducedAsset: { findMany: async () => [], count: async () => 0, updateMany: async () => ({ count: 0 }) },
    };
    return prisma;
  }

  it('refuses even when the project would take the already_running early return', async () => {
    process.env.RAIVSTREAM_5_ENABLED = 'true';
    process.env.RAIVSTREAM_5_PRODUCTION_ENABLED = 'true';
    const { ProductionPlanService } = await import('../service');
    // GENERATING is the state that returned already_running and skipped the gate.
    await expect(
      new ProductionPlanService().produce(prismaFor('GENERATING', []), { projectId: 'p1', userId: 'u1' }),
    ).rejects.toThrow(/CAST_NOT_APPROVED.*Lighthouse Keeper/);
  });

  it('still returns already_running once the cast is approved', async () => {
    process.env.RAIVSTREAM_5_ENABLED = 'true';
    process.env.RAIVSTREAM_5_PRODUCTION_ENABLED = 'true';
    const { ProductionPlanService } = await import('../service');
    const result = await new ProductionPlanService().produce(prismaFor('GENERATING', ['Lighthouse Keeper']), { projectId: 'p1', userId: 'u1' });
    expect(result).toEqual({ started: false, reason: 'already_running' });
  });
});
