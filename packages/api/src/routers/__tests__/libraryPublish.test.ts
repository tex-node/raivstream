import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../index';

/**
 * Publishing a story asset is the only path from the library into the feed, so
 * two properties matter: the row is owned by the caller, and it is created in
 * PENDING moderation rather than born visible.
 */

function makePrisma(opts: {
  asset?: Record<string, unknown> | null;
  duplicate?: boolean;
} = {}) {
  const asset = opts.asset === undefined
    ? { id: 'asset-1', assetUrl: 'https://cdn/asset.mp4', thumbnailUrl: 'https://cdn/t.jpg', durationSeconds: 5.4 }
    : opts.asset;

  const created: Array<Record<string, unknown>> = [];

  return {
    created,
    storySceneAsset: { findFirst: vi.fn(async () => asset) },
    video: {
      findFirst: vi.fn(async () => (opts.duplicate ? { id: 'existing' } : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'video-1', moderationStatus: data.moderationStatus };
      }),
    },
    // scanAndUpdateVideo runs fire-and-forget and touches these.
    moderationLog: { create: vi.fn(async () => ({})) },
    videoInteraction: { findMany: vi.fn(async () => []) },
  };
}

function caller(prisma: ReturnType<typeof makePrisma>) {
  return appRouter.createCaller({
    prisma: prisma as never,
    userId: 'u1',
    user: { id: 'u1', email: 'a@b.test', username: 'u', displayName: 'U', role: 'CREATOR' as const },
  } as never);
}

describe('library.publishAsset', () => {
  it('creates a PENDING video owned by the caller', async () => {
    const prisma = makePrisma();
    const result = await caller(prisma).library.publishAsset({
      assetId: 'asset-1', title: 'My story', isKidsSafe: false,
    });

    expect(result.moderationStatus).toBe('PENDING');
    expect(prisma.created[0]).toMatchObject({
      creatorId: 'u1',
      title: 'My story',
      mp4Url: 'https://cdn/asset.mp4',
      thumbnailUrl: 'https://cdn/t.jpg',
      status: 'READY',
      moderationStatus: 'PENDING',
      isKidsSafe: false,
      duration: 5,
    });
  });

  it('scopes the asset lookup to the caller', async () => {
    const prisma = makePrisma();
    await caller(prisma).library.publishAsset({ assetId: 'asset-1', title: 'x', isKidsSafe: false });

    const firstCall = prisma.storySceneAsset.findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(firstCall[0].where)
      .toMatchObject({ id: 'asset-1', userId: 'u1', assetType: 'VIDEO', status: 'READY' });
  });

  it('honours the kids-safe flag', async () => {
    const prisma = makePrisma();
    await caller(prisma).library.publishAsset({ assetId: 'asset-1', title: 'x', isKidsSafe: true });

    expect(prisma.created[0].isKidsSafe).toBe(true);
  });

  it('refuses a non-video or unowned asset', async () => {
    const prisma = makePrisma({ asset: null });
    await expect(
      caller(prisma).library.publishAsset({ assetId: 'nope', title: 'x', isKidsSafe: false }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(prisma.video.create).not.toHaveBeenCalled();
  });

  it('refuses to publish the same asset twice', async () => {
    const prisma = makePrisma({ duplicate: true });
    await expect(
      caller(prisma).library.publishAsset({ assetId: 'asset-1', title: 'x', isKidsSafe: false }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
