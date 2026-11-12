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
          // The publish gate (2026-11-12) judges the story's contracts, so this fixture is a story
          // that has been read and resolves. These tests are about feed policy, not completeness;
          // the gate has its own tests in storyContract.test.ts.
          chapters: [
            {
              chapterNumber: 1,
              storyContract: {
                protagonist: 'Goalina',
                want: 'to win the cup',
                obstacle: 'the rival team',
                turn: 'the storm stops the match',
                resolution: { outcome: 'ANSWERED', text: 'She lifts the cup.' },
                extractedBy: 'model',
                extractorVersion: 2,
              },
            },
          ],
        },
      })),
    },
    // Publish reads the story's chapters and extracts any that were never read (2026-11-12). This
    // fixture's chapters already carry a resolved contract, so no extraction runs and no model is
    // called; the policy question is what these tests are about.
    storyChapter: {
      findMany: vi.fn(async () => [
        {
          id: 'chapter-1',
          chapterNumber: 1,
          body: 'Goalina wins the cup.',
          storyContract: {
            protagonist: 'Goalina',
            want: 'to win the cup',
            obstacle: 'the rival team',
            turn: 'the storm stops the match',
            resolution: { outcome: 'ANSWERED', text: 'She lifts the cup.' },
            extractedBy: 'model',
            extractorVersion: 2,
          },
        },
      ]),
      update: vi.fn(async () => ({})),
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
    });

    expect(prisma.created[0].isKidsSafe).toBe(true);
  });

  it('refuses a KIDS story published from a non-R16 session', async () => {
    const prisma = makePrisma('KIDS');
    await expect(
      caller(prisma, false).story.publishExport({ exportId: 'export-1', title: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('a caller cannot choose the audience by passing isKidsSafe', async () => {
    const prisma = makePrisma('GENERAL');
    // The field is not in the input schema, so Zod strips it: a caller asking for
    // the kids feed gets the policy's answer instead of an error.
    await caller(prisma).story.publishExport({
      exportId: 'export-1',
      title: 'Princess Goalina',
      isKidsSafe: true,
    } as never);

    expect(prisma.created[0].isKidsSafe).toBe(false);
  });
});
