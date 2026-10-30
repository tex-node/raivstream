import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/analytics')>();
  return { ...actual, analytics: { ...actual.analytics, track: vi.fn(async () => undefined) } };
});
vi.mock('../../lib/cache', () => ({ invalidateFeedCaches: vi.fn(async () => undefined) }));

import { appRouter } from '../../index';

/**
 * Withdrawal is available on both surfaces. General-feed videos never receive
 * `submittedForPublicationAt`, so the old precondition (submitted only) made them
 * un-withdrawable even though they can be published. These tests pin the new
 * contract: live = submitted OR publishedAt.
 */
function makePrisma(row: Record<string, unknown> | null) {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    video: {
      findFirst: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: 'v1', moderationStatus: 'APPROVED', withdrawnAt: data.withdrawnAt ?? null };
      }),
    },
  };
}

const caller = (prisma: ReturnType<typeof makePrisma>) =>
  appRouter.createCaller({
    prisma: prisma as never,
    userId: 'u1',
    user: { id: 'u1', email: 'a@b.test', username: 'u', displayName: 'U', role: 'CREATOR' as const },
  } as never);

const generalLive = {
  id: 'v1',
  creatorId: 'u1',
  isKidsSafe: false,
  publishedAt: new Date(),
  submittedForPublicationAt: null,
  withdrawnAt: null,
  moderationStatus: 'APPROVED',
};

describe('withdrawPublication — general feed', () => {
  it('withdraws a published general video (no submittedForPublicationAt)', async () => {
    const prisma = makePrisma(generalLive);
    await caller(prisma).video.withdrawPublication({ videoId: 'v1' });
    expect(prisma.updates[0].withdrawnAt).toBeInstanceOf(Date);
  });

  it('refuses when the video was never live on either surface', async () => {
    const prisma = makePrisma({ ...generalLive, publishedAt: null });
    await expect(caller(prisma).video.withdrawPublication({ videoId: 'v1' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(prisma.updates).toHaveLength(0);
  });

  it('reports CONFLICT on a double withdraw', async () => {
    const prisma = makePrisma({ ...generalLive, withdrawnAt: new Date() });
    await expect(caller(prisma).video.withdrawPublication({ videoId: 'v1' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('resubmitting a general video clears withdrawnAt without re-entering review', async () => {
    const prisma = makePrisma({ ...generalLive, withdrawnAt: new Date() });
    await caller(prisma).video.resubmitPublication({ videoId: 'v1' });
    expect(prisma.updates[0]).toEqual({ withdrawnAt: null });
  });
});
