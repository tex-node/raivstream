import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The new-take path (2026-11-03).
 *
 * `produce()` reuses READY assets, so a produced scene was frozen. A reset is refused because
 * it replays the charge key. A take is a NEW row with a NEW key: it renders again, charges
 * once, demotes the previous take and keeps it as history.
 */

vi.mock('../generationAdapter', () => ({
  generateStill: vi.fn(async () => ({ assetUrl: 'https://cdn.example/take2.png' })),
}));
vi.mock('../../../credits', () => ({
  MODEL_FEATURE_KEY: { FLUX2: 'generate:flux2', H3_MAX: 'generate:h3_max' },
  deductCredits: vi.fn(async () => 80),
  chargeOrThrow: vi.fn(async () => 80),
}));
vi.mock('../identityBlock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identityBlock')>();
  return { ...actual, resolveCreativeReferences: vi.fn(async () => ['https://cdn.example/ref.png']) };
});

import { chargeOrThrow } from '../../../credits';
import { createNewTake } from '../newTake';

function makePrisma(opts: { previous?: { id: string; takeNumber: number } | null } = {}) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const prisma = {
    creativeProducedAsset: {
      findFirst: vi.fn(async () => opts.previous ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'take_2' };
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updated.push(args);
        return {};
      }),
    },
    creativeProject: {
      findUnique: vi.fn(async () => ({ userId: 'user_1' })),
    },
    characterReferenceAsset: { findFirst: vi.fn(async () => null) },
  };
  return { prisma: prisma as never, created, updated, raw: prisma };
}

const input = {
  projectId: 'proj_1',
  sceneId: 'SCENE_02',
  characters: [{ name: 'Lighthouse Keeper', visualDescription: 'a weathered man in his sixties' }],
  scenePrompt: 'Introduce the obstacle and raise the stakes.',
};

describe('a new take is a new row', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates takeNumber = max + 1 with the previous take as its parent', async () => {
    const { prisma, created } = makePrisma({ previous: { id: 'take_1', takeNumber: 1 } });
    const result = await createNewTake(prisma, input);
    expect(result.takeNumber).toBe(2);
    expect(result.parentTakeId).toBe('take_1');
    expect(created[0]).toMatchObject({ takeNumber: 2, parentTakeId: 'take_1', kind: 'IMAGE' });
  });

  it('starts at take 1 when the scene has never been produced', async () => {
    const { prisma } = makePrisma({ previous: null });
    const result = await createNewTake(prisma, input);
    expect(result.takeNumber).toBe(1);
    expect(result.parentTakeId).toBeNull();
  });

  it('demotes the previous take instead of deleting it', async () => {
    const { prisma, updated } = makePrisma({ previous: { id: 'take_1', takeNumber: 1 } });
    await createNewTake(prisma, input);
    const demotion = updated.find((u) => u.where.id === 'take_1');
    expect(demotion?.data).toEqual({ isLatest: false });
    expect(updated.some((u) => u.data && (u.data as { status?: string }).status === 'READY')).toBe(true);
  });

  it('charges on the new row, so a take is billed exactly once', async () => {
    const { prisma } = makePrisma({ previous: { id: 'take_1', takeNumber: 1 } });
    const result = await createNewTake(prisma, input);
    expect(result.creditsCharged).toBe(80);
    const call = (chargeOrThrow as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(String(call[3])).toContain('creative-take-take_2-a1');
  });

  it('renders with the framing phrase and the references resolved for this take', async () => {
    const { prisma } = makePrisma({ previous: { id: 'take_1', takeNumber: 1 } });
    const result = await createNewTake(prisma, input);
    expect(result.promptsFramed).toBe(true);
    expect(result.framing).toBe('identity-bearing');
    expect(result.identityBlock).toContain('Lighthouse Keeper');
  });
});