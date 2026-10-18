import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Invalidation hooks on the mutations that change feed *membership*.
 * `interaction.toggleLike` is the D-071 regression guard: it must NOT invalidate.
 *
 * The cache module is mocked so these assert call order/counts, not Redis.
 */

const { invalidateFeedCachesMock, invalidateMock, events } = vi.hoisted(() => ({
  events: [] as string[],
  invalidateFeedCachesMock: vi.fn(async () => {
    events.push('invalidateFeeds');
    return 2;
  }),
  invalidateMock: vi.fn(async (key: string) => {
    events.push(`invalidate:${key}`);
    return true;
  }),
}));

vi.mock('../../lib/cache', () => ({
  invalidateFeedCaches: invalidateFeedCachesMock,
  invalidate: invalidateMock,
  invalidatePrefix: vi.fn(async () => 0),
  cached: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../lib/analytics', () => ({
  analytics: { track: vi.fn(async () => undefined) },
}));

import { videoRouter } from '../video';
import { adminRouter } from '../admin';
import { interactionRouter } from '../interaction';

const user = {
  id: 'u1',
  email: 'u1@example.com',
  username: 'u1',
  displayName: 'U1',
  avatarUrl: null,
  role: 'CREATOR',
  premiumTier: 'FREE',
  verified: false,
  followerCount: 0,
  followingCount: 0,
  totalViews: 0,
  totalLikes: 0,
};

function ctx(prisma: unknown, role = 'CREATOR', isR16 = true) {
  return {
    prisma,
    user: { ...user, role },
    userId: 'u1',
    isR16,
    ip: '203.0.113.5',
  } as never;
}

beforeEach(() => {
  events.length = 0;
  invalidateFeedCachesMock.mockClear();
  invalidateMock.mockClear();
});

describe('cache invalidation hooks', () => {
  it('10. video.submitForPublication invalidates both feed caches', async () => {
    const prisma = {
      video: {
        findFirst: async () => ({
          id: 'v1', creatorId: 'u1', status: 'READY', moderationStatus: 'PENDING', submittedForPublicationAt: null,
        }),
        update: async () => { events.push('write'); return { id: 'v1' }; },
      },
    };

    await videoRouter.createCaller(ctx(prisma, 'CREATOR', true)).submitForPublication({ videoId: 'v1' });

    expect(invalidateFeedCachesMock).toHaveBeenCalledTimes(1);
    expect(events).toContain('invalidateFeeds');
    // Order: the write happens before the invalidation.
    expect(events.indexOf('write')).toBeLessThan(events.indexOf('invalidateFeeds'));
  });

  it('11. admin.moderateVideo invalidates both feed caches', async () => {
    const prisma = {
      video: { findUnique: async () => ({ id: 'v1' }) },
      $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
      moderationLog: { create: async () => ({}) },
    };
    prisma.video = { ...prisma.video, update: async () => { events.push('write'); return {}; } } as never;

    await adminRouter.createCaller(ctx(prisma, 'MODERATOR')).moderateVideo({ videoId: 'v1', action: 'approve' });

    expect(invalidateFeedCachesMock).toHaveBeenCalledTimes(1);
  });

  it('12. admin.updateCreditRate invalidates the returned row’s featureKey (not the input id)', async () => {
    const prisma = {
      featureCreditRate: {
        update: async () => { events.push('write'); return { id: 'rate-1', featureKey: 'generate:flux2' }; },
      },
    };

    await adminRouter.createCaller(ctx(prisma, 'ADMIN')).updateCreditRate({ id: 'rate-1', creditsPerUnit: 90 });

    expect(invalidateMock).toHaveBeenCalledWith('feature:rate:generate:flux2');
    expect(events.indexOf('write')).toBeLessThan(events.indexOf('invalidate:feature:rate:generate:flux2'));
  });

  it('13. a failed write does not invalidate (no stale-cache repopulation)', async () => {
    const prisma = {
      video: {
        findFirst: async () => ({
          id: 'v1', creatorId: 'u1', status: 'READY', moderationStatus: 'PENDING', submittedForPublicationAt: null,
        }),
        update: async () => { throw new Error('db write failed'); },
      },
    };

    await expect(
      videoRouter.createCaller(ctx(prisma, 'CREATOR', true)).submitForPublication({ videoId: 'v1' }),
    ).rejects.toThrow();

    expect(invalidateFeedCachesMock).not.toHaveBeenCalled();
  });

  it('13b. a failed credit-rate write does not invalidate', async () => {
    const prisma = {
      featureCreditRate: { update: async () => { throw new Error('db write failed'); } },
    };

    await expect(
      adminRouter.createCaller(ctx(prisma, 'ADMIN')).updateCreditRate({ id: 'rate-1', creditsPerUnit: 90 }),
    ).rejects.toThrow();

    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it('14. interaction.toggleLike invalidates nothing (D-071)', async () => {
    const prisma = {
      videoInteraction: {
        findUnique: async () => null,
        upsert: async () => ({}),
      },
      video: {
        update: async () => ({}),
        findUnique: async () => ({ creatorId: 'u2', likeCount: 1, dislikeCount: 0, avgStarRating: 0, starRatingCount: 0, engagementScore: 0, publishedAt: new Date() }),
      },
      notification: { create: async () => ({}) },
    };

    await interactionRouter.createCaller(ctx(prisma)).toggleLike({ videoId: 'v1' });

    expect(invalidateFeedCachesMock).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});
