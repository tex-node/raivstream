import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/analytics')>();
  return { ...actual, analytics: { ...actual.analytics, track: vi.fn(async () => undefined) } };
});

import { appRouter } from '../../index';

/**
 * `status` and `moderationStatus` are two axes: the media lifecycle and the review
 * state. Reject blocks the media; approve must restore it ONLY when it was blocked.
 * Without that condition, approving a PROCESSING or FAILED video would silently
 * promote it to READY.
 */
function makePrisma(status: string) {
  const videoUpdates: Array<Record<string, unknown>> = [];
  return {
    videoUpdates,
    video: {
      findUnique: vi.fn(async () => ({
        id: 'v1',
        status,
        moderationStatus: status === 'BLOCKED' ? 'REJECTED' : 'PENDING',
        creatorId: 'u1',
        isKidsSafe: false,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        videoUpdates.push(data);
        return { id: 'v1', ...data };
      }),
    },
    moderationLog: { create: vi.fn(async () => ({ id: 'log-1' })) },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
}

const adminCaller = (prisma: ReturnType<typeof makePrisma>) =>
  appRouter.createCaller({
    prisma: prisma as never,
    userId: 'u1',
    user: { id: 'u1', email: 'a@b.test', username: 'u', displayName: 'U', role: 'ADMIN' as const },
  } as never);

describe('admin.moderateVideo — status axis', () => {
  it('reject sets status BLOCKED', async () => {
    const prisma = makePrisma('READY');
    await adminCaller(prisma).admin.moderateVideo({ videoId: 'v1', action: 'reject', reason: 'not suitable' });
    expect(prisma.videoUpdates[0]).toMatchObject({ moderationStatus: 'REJECTED', status: 'BLOCKED' });
  });

  it('approve restores READY when the video was BLOCKED', async () => {
    const prisma = makePrisma('BLOCKED');
    await adminCaller(prisma).admin.moderateVideo({ videoId: 'v1', action: 'approve' });
    expect(prisma.videoUpdates[0]).toMatchObject({ moderationStatus: 'APPROVED', status: 'READY' });
  });

  it('approve leaves a non-BLOCKED status alone (PROCESSING stays PROCESSING)', async () => {
    const prisma = makePrisma('PROCESSING');
    await adminCaller(prisma).admin.moderateVideo({ videoId: 'v1', action: 'approve' });
    expect(prisma.videoUpdates[0]).toMatchObject({ moderationStatus: 'APPROVED' });
    expect(prisma.videoUpdates[0]).not.toHaveProperty('status');
  });

  it('flag does not touch status', async () => {
    const prisma = makePrisma('READY');
    await adminCaller(prisma).admin.moderateVideo({ videoId: 'v1', action: 'flag', reason: 'check lang' });
    expect(prisma.videoUpdates[0]).toMatchObject({ moderationStatus: 'FLAGGED' });
    expect(prisma.videoUpdates[0]).not.toHaveProperty('status');
  });
});
