/**
 * Track D Layer 2 — locked identity block procedures.
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
  return { ...actual, deductCredits: vi.fn(async () => 0), refundCredits: vi.fn(async () => undefined) };
});
vi.mock('../../lib/r2', () => ({
  mirrorUrlToR2: vi.fn(async () => 'https://cdn.test/ref.png'),
  uploadBufferToR2: vi.fn(async () => 'https://cdn.test/ref.png'),
  getPublicUrlForKey: vi.fn(() => 'https://cdn.test/x'),
}));

import { storyRouter } from '../story';
import { composeIdentityBlock } from '../../lib/story/characterIdentity';

function makePrisma() {
  const char: Record<string, unknown> = {
    id: 'ch1', projectId: 'p1', name: 'Max',
    visualDescription: 'golden puppy with a blue backpack',
    favoriteExpression: 'wide-eyed grin', walkingStyle: 'bouncy trot',
    immutableDetails: { eyeColor: 'amber' },
    lockedIdentityBlock: null, identityFrozenAt: null,
  };
  return {
    storyCharacterMemory: {
      findFirst: vi.fn(async ({ where }: { where?: { project?: { userId?: string } } }) => {
        if (where?.project?.userId && where.project.userId !== 'u1') return null;
        return { ...char };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(char, data);
        return { id: char.id, lockedIdentityBlock: char.lockedIdentityBlock, identityFrozenAt: char.identityFrozenAt };
      }),
    },
    analyticsEvent: { create: vi.fn(async () => ({})) },
    __char: char,
  };
}

const ctx = (prisma: unknown, userId = 'u1') => ({ user: { id: userId, role: 'USER' }, isR16: true, prisma }) as never;

beforeEach(() => vi.clearAllMocks());

describe('Track D Layer 2 — lock/unlock procedures', () => {
  it('6. lockCharacterIdentity sets the block + freeze timestamp; unlock clears both', async () => {
    const prisma = makePrisma();
    const locked = await storyRouter.createCaller(ctx(prisma)).lockCharacterIdentity({ characterId: 'ch1', block: 'MAX: golden puppy, amber eyes' });
    expect(locked).toMatchObject({ lockedIdentityBlock: 'MAX: golden puppy, amber eyes' });
    expect(prisma.storyCharacterMemory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lockedIdentityBlock: 'MAX: golden puppy, amber eyes', identityFrozenAt: expect.any(Date) }) }),
    );

    const unlocked = await storyRouter.createCaller(ctx(prisma)).unlockCharacterIdentity({ characterId: 'ch1' });
    expect(unlocked).toMatchObject({ lockedIdentityBlock: null, identityFrozenAt: null });
  });

  it('7. owner-only: an intruder is rejected on lock, unlock, and preview', async () => {
    const prisma = makePrisma();
    const intruder = storyRouter.createCaller(ctx(prisma, 'intruder'));
    await expect(intruder.lockCharacterIdentity({ characterId: 'ch1', block: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(intruder.unlockCharacterIdentity({ characterId: 'ch1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(intruder.previewCharacterIdentity({ characterId: 'ch1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.storyCharacterMemory.update).not.toHaveBeenCalled();
  });

  it('8. previewCharacterIdentity returns the deterministic composed block + current lock', async () => {
    const prisma = makePrisma();
    const res = await storyRouter.createCaller(ctx(prisma)).previewCharacterIdentity({ characterId: 'ch1' });
    expect(res.current).toBeNull();
    expect(res.composed).toBe(composeIdentityBlock({ name: 'Max', visualDescription: 'golden puppy with a blue backpack', favoriteExpression: 'wide-eyed grin', walkingStyle: 'bouncy trot', immutableDetails: { eyeColor: 'amber' } }));
  });

  it('9. lockCharacterIdentity rejects an empty or oversized block', async () => {
    const prisma = makePrisma();
    const caller = storyRouter.createCaller(ctx(prisma));
    await expect(caller.lockCharacterIdentity({ characterId: 'ch1', block: '   ' })).rejects.toBeTruthy();
    await expect(caller.lockCharacterIdentity({ characterId: 'ch1', block: 'x'.repeat(2001) })).rejects.toBeTruthy();
  });
});
