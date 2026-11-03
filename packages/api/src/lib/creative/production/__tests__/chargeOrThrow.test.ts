import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The silent-zero fix (2026-11-03).
 *
 * Three defects had the same shape: a `catch` turning a failure into a plausible zero.
 * `castReferences` returned created=0, `resubmitPublication` reported success while changing
 * nothing, and `createNewTake` reported creditsCharged=0 when the owner had no balance row.
 * `chargeOrThrow` has no internal catch; a caller that tolerates failure must say so itself.
 */

vi.mock('../generationAdapter', () => ({
  generateStill: vi.fn(async () => ({ assetUrl: 'https://cdn.example/take.png' })),
}));
vi.mock('../../../credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../credits')>();
  return { ...actual, chargeOrThrow: vi.fn() };
});
vi.mock('../identityBlock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identityBlock')>();
  return { ...actual, resolveCreativeReferences: vi.fn(async () => []) };
});

import { chargeOrThrow } from '../../../credits';
import { createNewTake } from '../newTake';

function makePrisma() {
  return {
    creativeProducedAsset: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 'take_1' })),
      update: vi.fn(async () => ({})),
    },
    creativeProject: { findUnique: vi.fn(async () => ({ userId: 'user_1' })) },
    characterReferenceAsset: { findFirst: vi.fn(async () => null) },
  } as never;
}

const input = {
  projectId: 'proj_1',
  sceneId: 'SCENE_01',
  characters: [{ name: 'Lighthouse Keeper', visualDescription: 'a weathered man in his sixties' }],
  scenePrompt: 'Establish the character and their world.',
};

const mocked = chargeOrThrow as unknown as {
  mockRejectedValue: (e: Error) => void;
  mockResolvedValue: (v: number) => void;
};

describe('a take cannot report a charge it did not make', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails loudly when the owner has no balance row, instead of reporting zero', async () => {
    mocked.mockRejectedValue(new Error('No active credit rate configured for feature: generate:flux2'));
    await expect(createNewTake(makePrisma(), input)).rejects.toThrow(/credit rate|balance/i);
  });

  it('reports the real amount when the charge succeeds', async () => {
    mocked.mockResolvedValue(80);
    const result = await createNewTake(makePrisma(), input);
    expect(result.creditsCharged).toBe(80);
  });

  it('the escape hatch is explicit: a tolerant caller catches the throw itself', async () => {
    mocked.mockRejectedValue(new Error('insufficient credits'));
    let tolerated = 0;
    try {
      await createNewTake(makePrisma(), input);
    } catch {
      tolerated += 1;
    }
    expect(tolerated).toBe(1);
  });
});

describe('chargeOrThrow has no internal catch', () => {
  it('propagates the underlying error unchanged', async () => {
    const actual = await vi.importActual<typeof import('../../../credits')>('../../../credits');
    const prisma = {
      creditTransaction: { findUnique: vi.fn(async () => null) },
      featureCreditRate: { findUnique: vi.fn(async () => null) },
    } as never;
    await expect(actual.chargeOrThrow(prisma, 'u1', 'generate:flux2', 'ref', 'desc', 'key-1')).rejects.toThrow();
  });
});