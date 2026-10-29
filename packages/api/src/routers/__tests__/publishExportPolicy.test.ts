import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../index';

/**
 * Proves the policy path actually executes in `publishExport`.
 *
 * A live GENERAL story was published with `isKidsSafe: true`, which the deployed
 * code cannot produce if `resolveExportPolicy` runs. Either the policy path was
 * not executing (a real defect) or the row predates it (legacy data). This test
 * decides which, so the data correction fixes a cause rather than masking one.
 */
function makePrisma(audienceMode: string | null) {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    storyVideoExport: {
      findUnique: vi.fn(async () => ({
        id: 'export-1',
        userId: 'u1',
        status: 'READY',
        assetUrl: 'https://cdn/export.mp4',
        durationSeconds: 93.47,
        project: {
          title: 'Princess Goalina',
          audienceMode,
          coverAsset: { assetUrl: null, thumbnailUrl: null },
        },
      })),
    },
    video: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'video-1', moderationStatus: 'PENDING' };
      }),
    },
  };
}

function caller(prisma: ReturnType<typeof makePrisma>, isR16 = false) {
  return appRouter.createCaller({
    prisma: prisma as never,
    userId: 'u1',
    isR16,
    user: { id: 'u1', email: 'a@b.test', username: 'u', displayName: 'U', role: 'CREATOR' as const },
  } as never);
}

describe('story.publishExport — policy', () => {
  it('a GENERAL story publishes as NOT kids-safe', async () => {
    const prisma = makePrisma('GENERAL');
    const result = await caller(prisma).story.publishExport({
      exportId: 'export-1',
      title: 'Princess Goalina',
      // The caller may claim anything; the policy must win.
      isKidsSafe: true,
    });

    expect(result.videoId).toBe('video-1');
    expect(prisma.created[0]).toMatchObject({
      isKidsSafe: false,
      moderationStatus: 'PENDING',
      mp4Url: 'https://cdn/export.mp4',
      duration: 93,
    });
  });

  it('a KIDS story publishes as kids-safe when the session is R16', async () => {
    const prisma = makePrisma('KIDS');
    await caller(prisma, true).story.publishExport({
      exportId: 'export-1',
      title: 'Kids story',
      isKidsSafe: false,
    });

    expect(prisma.created[0].isKidsSafe).toBe(true);
  });

  it('refuses a KIDS story published from a non-R16 session', async () => {
    const prisma = makePrisma('KIDS');
    await expect(
      caller(prisma, false).story.publishExport({ exportId: 'export-1', title: 'x', isKidsSafe: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
