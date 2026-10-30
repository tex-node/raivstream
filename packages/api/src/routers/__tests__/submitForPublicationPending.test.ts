import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/analytics')>();
  return { ...actual, analytics: { ...actual.analytics, track: vi.fn(async () => undefined) } };
});
vi.mock('../../lib/cache', () => ({ invalidateFeedCaches: vi.fn(async () => undefined) }));

import { appRouter } from '../../index';

/**
 * submitForPublication and publishExport are NOT idempotent partners:
 * publishExport refuses a duplicate by mp4Url (CONFLICT), while
 * submitForPublication happily accepts an already-PENDING video and only adds
 * the submission marker. That is why the R16 button treats "published" and
 * "submitted" as two facts.
 */
function makePrisma() {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    video: {
      findFirst: vi.fn(async () => ({
        id: 'video-1',
        creatorId: 'u1',
        status: 'READY',
        moderationStatus: 'PENDING',
        submittedForPublicationAt: null,
        withdrawnAt: null,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: 'video-1', moderationStatus: 'PENDING', submittedForPublicationAt: data.submittedForPublicationAt };
      }),
    },
  };
}

const caller = (prisma: ReturnType<typeof makePrisma>) =>
  appRouter.createCaller({
    prisma: prisma as never,
    userId: 'u1',
    isR16: true,
    user: { id: 'u1', email: 'a@b.test', username: 'u', displayName: 'U', role: 'CREATOR' as const },
  } as never);

describe('video.submitForPublication — a PENDING video', () => {
  it('succeeds and records the submission marker', async () => {
    const prisma = makePrisma();
    await caller(prisma).video.submitForPublication({ videoId: 'video-1' });
    expect(prisma.updates[0]).toMatchObject({
      moderationStatus: 'PENDING',
      withdrawnAt: null,
      submittedForPublicationAt: expect.any(Date),
    });
  });

  it('refuses a second submission', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({
      id: 'video-1',
      creatorId: 'u1',
      status: 'READY',
      moderationStatus: 'PENDING',
      submittedForPublicationAt: new Date(),
      withdrawnAt: null,
    } as never);
    await expect(
      caller(prisma).video.submitForPublication({ videoId: 'video-1' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.updates).toHaveLength(0);
  });

  it('refuses a video that is not READY', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({
      id: 'video-1',
      creatorId: 'u1',
      status: 'PROCESSING',
      moderationStatus: 'PENDING',
      submittedForPublicationAt: null,
      withdrawnAt: null,
    } as never);
    await expect(
      caller(prisma).video.submitForPublication({ videoId: 'video-1' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
