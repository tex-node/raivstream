/**
 * R16-04 follow-up — the batch path must reuse `generateSceneImageAsset` (and
 * therefore `computeSceneImageRouting`). Guards against a future refactor forking
 * the batch onto a lower-level submit that bypasses Track D routing.
 *
 * `batchDepsFor` is the wiring point: its `generateScene` dep is what `runBatch`
 * invokes per item. If that stops reaching `computeSceneImageRouting`, batched
 * scene generation silently loses the FLUX2_EDIT reference-conditioning + seed.
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
    deductCredits: vi.fn(async () => 80),
    refundCredits: vi.fn(async () => undefined),
    getFeatureCreditCost: vi.fn(async () => 80),
  };
});
vi.mock('../../lib/r2', () => ({
  mirrorUrlToR2: vi.fn(async () => 'https://cdn.test/x.png'),
  uploadBufferToR2: vi.fn(async () => 'https://cdn.test/x.png'),
  getPublicUrlForKey: vi.fn(() => 'https://cdn.test/x'),
}));
vi.mock('../../lib/mediaProviders/config', () => ({
  isFalCapabilityLive: vi.fn(() => true),
  readFalMediaConfig: vi.fn(() => ({})),
}));
vi.mock('../../lib/story/characterIdentity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/story/characterIdentity')>();
  return {
    ...actual,
    computeSceneImageRouting: vi.fn(() => ({
      effectiveModel: 'FLUX2_EDIT',
      effectivePrompt: 'the scene @image1',
      imageUrls: ['https://cdn.test/ref.png'],
      truncated: false,
      editLive: true,
      seed: 123,
    })),
    fetchApprovedReferences: vi.fn(async () => [{ characterName: 'Zephyr', assetUrl: 'https://cdn.test/ref.png' }]),
  };
});

import { batchDepsFor } from '../story';
import { computeSceneImageRouting } from '../../lib/story/characterIdentity';

function makePrisma() {
  const project = {
    id: 'p1',
    audienceMode: 'KIDS',
    visualStyle: 'CARTOON',
    characterMemory: [{ name: 'Zephyr', approvedReferenceAssetId: 'ref1' }],
  };
  const scene = {
    id: 's1',
    projectId: 'p1',
    orderIndex: 1,
    title: 'Scene',
    description: 'd',
    characters: ['Zephyr'],
    project,
    chapter: { blueprint: null },
    prompts: [],
  };
  return {
    storyProject: { findFirst: vi.fn(async () => project) },
    storySceneSeed: { findFirst: vi.fn(async () => scene) },
    characterReferenceAsset: { findMany: vi.fn(async () => [{ id: 'ref1', assetUrl: 'https://cdn.test/ref.png' }]) },
    storySceneAsset: {
      create: vi.fn(async ({ data }: any) => ({ id: 'asset1', ...data })),
      update: vi.fn(async () => ({})),
    },
    generationJob: { create: vi.fn(async () => ({ id: 'job1' })), update: vi.fn(async () => ({})) },
    analyticsEvent: { create: vi.fn(async () => ({})) },
  };
}

const ctx = (prisma: unknown) => ({ user: { id: 'u1', role: 'USER' }, isR16: false, prisma }) as never;

beforeEach(() => vi.clearAllMocks());

describe('batchDepsFor wiring', () => {
  it('generateScene reaches computeSceneImageRouting with the batch sceneId (FLUX2_EDIT path)', async () => {
    const prisma = makePrisma();
    const deps = await batchDepsFor(ctx(prisma));
    await deps.generateScene({ projectId: 'p1' }, 's1').catch(() => undefined);

    expect(computeSceneImageRouting).toHaveBeenCalled();
    const arg = (computeSceneImageRouting as unknown as { mock: { calls: any[][] } }).mock.calls[0]![0];
    expect(arg.sceneId).toBe('s1');
    expect(arg.requestedModel).toBe('FLUX2');
    expect(arg.capabilityLive).toBe(true);
  });
});
