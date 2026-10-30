/**
 * Phase 2 (R16-03) — character reference generation, approval, and continuity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creditKeys } from '../../lib/credits/idempotencyKeys';

vi.mock('../../lib/promptModeration', () => ({
  moderatePrompt: vi.fn(async () => ({ allowed: true, flagged: false, categories: [], scores: {} })),
  moderationRejectMessage: vi.fn(() => 'rejected'),
  suggestSafeRewrite: vi.fn(async () => null),
}));
vi.mock('../../lib/analytics', () => ({ analytics: { track: vi.fn(async () => undefined) } }));
vi.mock('../../lib/credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/credits')>();
  return { ...actual, deductCredits: vi.fn(async () => 0), refundCredits: vi.fn(async () => undefined) };
});
vi.mock('../../lib/r2', () => ({
  mirrorUrlToR2: vi.fn(async () => 'https://cdn.test/ref.png'),
  uploadBufferToR2: vi.fn(async () => 'https://cdn.test/ref.png'),
  getPublicUrlForKey: vi.fn(() => 'https://cdn.test/x'),
}));

import { storyRouter, resolveSceneApprovedReferences, characterReferencePrompt } from '../story';
import { deductCredits } from '../../lib/credits';
import { applyMasterVisualBible } from '../../lib/visualBible';

function makePrisma() {
  const char = {
    id: 'ch1', projectId: 'p1', name: 'Ada', role: 'hero', species: 'human',
    ageDescription: 'young', gender: 'female', visualDescription: 'tall and quick',
    favoriteExpression: 'a grin', walkingStyle: 'springy',
    approvedReferenceAssetId: null as string | null,
  };
  const refs: Array<Record<string, unknown>> = [];
  return {
    storyCharacterMemory: {
      findFirst: vi.fn(async ({ where }: { where?: { project?: { userId?: string } } }) => {
        if (where?.project?.userId && where.project.userId !== 'u1') return null;
        return { ...char };
      }),
      findUnique: vi.fn(async () => ({ id: char.id, approvedReferenceAssetId: char.approvedReferenceAssetId, approvedAt: new Date() })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: char.id, ...data })),
    },
    characterReferenceAsset: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ref-${refs.length + 1}`, createdAt: new Date(Date.now() + refs.length), ...data };
        refs.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = refs.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row ?? { id: where.id, ...data };
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findFirst: vi.fn(async ({ where }: { where: { id: string; characterId: string; projectId: string } }) =>
        where.id === 'ref-1' && where.characterId === 'ch1' && where.projectId === 'p1'
          ? { id: where.id, category: mockAssetCategory }
          : null,
      ),
      findMany: vi.fn(async ({ where, select }: { where: { characterId: string }; select?: Record<string, boolean> }) =>
        refs
          .filter((r) => r.characterId === where.characterId)
          .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())
          .map((r) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : r)),
      ),
    },
    analyticsEvent: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        characterReferenceAsset: {
          updateMany: async () => ({ count: 0 }),
          update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const row = refs.find((r) => r.id === where.id);
            if (row) Object.assign(row, data);
            return row ?? { id: where.id, ...data };
          },
        },
      }),
    ),
    __char: char,
    __refs: refs,
  };
}

const ctx = (prisma: unknown, userId = 'u1') => ({ user: { id: userId, role: 'USER' }, isR16: true, prisma }) as never;

beforeEach(() => vi.clearAllMocks());

describe('characterReferencePrompt', () => {
  it('composes a character-only portrait prompt with a framing directive', () => {
    const p = characterReferencePrompt({ name: 'Ada', visualDescription: 'tall', role: 'hero' });
    expect(p).toContain('character reference portrait of Ada');
    expect(p).toContain('tall');
    expect(p).toContain('head-and-shoulders');
    expect(p).toContain('no scene context');
  });
});

describe('generateCharacterReference', () => {
  it('creates the row first, charges with the row-scoped key, and marks it READY + latest', async () => {
    const prisma = makePrisma();
    const res = await storyRouter.createCaller(ctx(prisma)).generateCharacterReference({ characterId: 'ch1' });
    const refId = prisma.__refs[0]!.id as string;

    // row created before submit, PENDING -> GENERATING
    expect(prisma.characterReferenceAsset.create).toHaveBeenCalledTimes(1);
    expect((prisma.characterReferenceAsset.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.status).toBe('PENDING');
    expect(prisma.characterReferenceAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: refId }, data: { status: 'GENERATING' } }),
    );

    // charged with the exact reusable scene-image key bound to the new row
    expect(deductCredits).toHaveBeenCalledWith(
      expect.anything(), 'u1', expect.anything(), `character-reference-${refId}`, expect.any(String), creditKeys.sceneImage.charge(refId),
    );
    expect(res).toMatchObject({ status: 'READY', isLatest: true, assetUrl: 'https://cdn.test/ref.png' });
  });

  it('requires ownership (NOT_FOUND for another user)', async () => {
    const prisma = makePrisma();
    await expect(storyRouter.createCaller(ctx(prisma, 'intruder')).generateCharacterReference({ characterId: 'ch1' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.characterReferenceAsset.create).not.toHaveBeenCalled();
  });
});

// The rule the schema cannot express: only CHARACTER references may attach to a
// character, so the approve path has to check the kind itself.
let mockAssetCategory = 'CHARACTER';

describe('approveCharacterReference', () => {
  it('requires ownership', async () => {
    const prisma = makePrisma();
    await expect(storyRouter.createCaller(ctx(prisma, 'intruder')).approveCharacterReference({ characterId: 'ch1', assetId: 'ref-1' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an asset from another character/project', async () => {
    const prisma = makePrisma();
    await expect(storyRouter.createCaller(ctx(prisma)).approveCharacterReference({ characterId: 'ch1', assetId: 'ref-OTHER' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('sets both fields for a valid READY asset', async () => {
    const prisma = makePrisma();
    const res = await storyRouter.createCaller(ctx(prisma)).approveCharacterReference({ characterId: 'ch1', assetId: 'ref-1' });
    expect(res).toMatchObject({ approvedReferenceAssetId: 'ref-1' });
    expect(prisma.storyCharacterMemory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvedReferenceAssetId: 'ref-1' }) }),
    );
  });

  it('refuses a non-character reference', async () => {
    const prisma = makePrisma();
    // Clear any approval left by an earlier test: the early-return branch would
    // otherwise short-circuit before the category check.
    prisma.__char.approvedReferenceAssetId = null;
    mockAssetCategory = 'PROP';
    await expect(
      storyRouter.createCaller(ctx(prisma)).approveCharacterReference({ characterId: 'ch1', assetId: 'ref-1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(prisma.storyCharacterMemory.update).not.toHaveBeenCalled();
    mockAssetCategory = 'CHARACTER';
  });

  it('is idempotent for the same asset (no update)', async () => {
    const prisma = makePrisma();
    prisma.__char.approvedReferenceAssetId = 'ref-1';
    await storyRouter.createCaller(ctx(prisma)).approveCharacterReference({ characterId: 'ch1', assetId: 'ref-1' });
    expect(prisma.storyCharacterMemory.update).not.toHaveBeenCalled();
  });
});

describe('revokeCharacterApproval', () => {
  it('clears both fields', async () => {
    const prisma = makePrisma();
    await storyRouter.createCaller(ctx(prisma)).revokeCharacterApproval({ characterId: 'ch1' });
    expect(prisma.storyCharacterMemory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { approvedReferenceAssetId: null, approvedAt: null } }),
    );
  });

  it('requires ownership', async () => {
    const prisma = makePrisma();
    await expect(storyRouter.createCaller(ctx(prisma, 'intruder')).revokeCharacterApproval({ characterId: 'ch1' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('listCharacterReferences', () => {
  it('returns newest-first flags and never leaks the raw prompt', async () => {
    const prisma = makePrisma();
    await storyRouter.createCaller(ctx(prisma)).generateCharacterReference({ characterId: 'ch1' });
    prisma.__char.approvedReferenceAssetId = prisma.__refs[0]!.id as string;
    const res = await storyRouter.createCaller(ctx(prisma)).listCharacterReferences({ characterId: 'ch1' });
    expect(res.references[0]).toMatchObject({ isApproved: true, isLatest: true });
    expect(res.references[0]).not.toHaveProperty('prompt');
  });
});

describe('continuity', () => {
  it('resolveSceneApprovedReferences: approved READY anchor + draft flag for the rest', async () => {
    const prisma = { characterReferenceAsset: { findMany: async () => [{ id: 'r1', assetUrl: 'https://cdn.test/r1.png' }] } };
    const res = await resolveSceneApprovedReferences(
      { prisma },
      { characters: [{ name: 'Ada' }, { name: 'Bola' }] },
      [{ name: 'Ada', approvedReferenceAssetId: 'r1' }, { name: 'Bola', approvedReferenceAssetId: null }],
    );
    expect(res.approvedReferences).toEqual({ Ada: 'https://cdn.test/r1.png' });
    expect(res.hasDraftReferences).toBe(true);
  });

  it('all approved → no draft flag, no anchors for unapproved', async () => {
    const res = await resolveSceneApprovedReferences(
      { prisma: { characterReferenceAsset: { findMany: async () => [] } } },
      { characters: ['Solo'] },
      [{ name: 'Solo', approvedReferenceAssetId: null }],
    );
    expect(res.approvedReferences).toEqual({});
    expect(res.hasDraftReferences).toBe(true);
  });

  it('applyMasterVisualBible injects the exact approved-reference anchor line', () => {
    const out = applyMasterVisualBible({
      prompt: 'a children scene',
      bible: { characters: {} },
      sceneCharacters: ['Ada'],
      approvedReferences: { Ada: 'https://cdn.test/r1.png' },
      target: 'IMAGE',
    });
    expect(out.prompt).toContain('Approved reference for Ada: https://cdn.test/r1.png');
  });
});
