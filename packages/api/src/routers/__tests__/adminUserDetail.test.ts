import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../index';

/**
 * Track C - admin user detail.
 *
 * The sums are the point: USAGE rows are stored negative, so reporting
 * `creditsUsed` as a magnitude is a decision the caller must not have to
 * reverse-engineer. These tests pin that convention.
 */

function makePrisma() {
  return {
    user: {
      findUnique: vi.fn(async () => ({
        id: 'u1', email: 'student@school.test', username: 'student', role: 'CREATOR', createdAt: new Date('2026-09-01'),
      })),
    },
    creditTransaction: {
      // Distinguish the two aggregate calls by their where clause.
      aggregate: vi.fn(async ({ where }: { where: { type?: string } }) =>
        where.type === 'USAGE'
          ? { _sum: { amount: -1125 } }
          : { _sum: { amount: 5000 } }),
      findMany: vi.fn(async () => [
        { id: 't1', amount: -1125, type: 'USAGE', featureKey: 'generate:veed_fabric_480p', balanceBefore: 37125, balanceAfter: 36000, createdAt: new Date('2026-10-27') },
      ]),
    },
    creditBalance: { findUnique: vi.fn(async () => ({ balance: 36000 })) },
    storyProject: { count: vi.fn(async () => 4) },
    video: { count: vi.fn(async () => 12) },
    storySceneAsset: { count: vi.fn(async () => 30) },
    audioAsset: { count: vi.fn(async () => 9) },
  };
}

function caller(prisma: ReturnType<typeof makePrisma>, role: 'ADMIN' | 'CREATOR' = 'ADMIN') {
  return appRouter.createCaller({
    prisma: prisma as never,
    userId: 'admin-1',
    user: { id: 'admin-1', email: 'a@b.test', username: 'admin', displayName: 'A', role },
  } as never);
}

describe('admin.getUserDetail', () => {
  it('reports spent credits as a positive magnitude', async () => {
    const prisma = makePrisma();
    const result = await caller(prisma).admin.getUserDetail({ userId: 'u1' });

    expect(result.usage.creditsUsed).toBe(1125);
    expect(result.usage.creditsBought).toBe(5000);
    expect(result.usage.currentBalance).toBe(36000);
  });

  it('counts published videos and totals media', async () => {
    const prisma = makePrisma();
    const result = await caller(prisma).admin.getUserDetail({ userId: 'u1' });

    expect(result.usage.videosPublished).toBe(12);
    expect(result.usage.storiesCreated).toBe(4);
    // 30 story assets + 9 audio + 12 videos
    expect(result.usage.mediaCount).toBe(51);
  });

  it('is admin-only', async () => {
    const prisma = makePrisma();
    await expect(caller(prisma, 'CREATOR').admin.getUserDetail({ userId: 'u1' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('hides media and ledger from non-admins too', async () => {
    const prisma = makePrisma();
    await expect(caller(prisma, 'CREATOR').admin.getUserMedia({ userId: 'u1', limit: 10 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(prisma, 'CREATOR').admin.getUserTransactions({ userId: 'u1', limit: 10 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
