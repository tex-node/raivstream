import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../index';

/**
 * The export -> Video link is `mp4Url === export.assetUrl`; there is no foreign
 * key. The R16 button relies on this lookup to mirror submitForPublication's
 * guards, so the lookup must be scoped, deterministic, and honest about "no row".
 */
function makePrisma(opts: {
  exportAssetUrl?: string | null;
  videos?: Array<Record<string, unknown>>;
}) {
  const exportFind = vi.fn(async () => ({ assetUrl: opts.exportAssetUrl ?? null }));
  const videoFind = vi.fn(async () => (opts.videos ?? [])[0] ?? null);
  return {
    exportFind,
    videoFind,
    storyVideoExport: { findFirst: exportFind },
    video: { findFirst: videoFind },
  };
}

const caller = (prisma: ReturnType<typeof makePrisma>) =>
  appRouter.createCaller({
    prisma: prisma as never,
    userId: 'u1',
    isR16: true,
    user: { id: 'u1', email: 'a@b.test', username: 'u', displayName: 'U', role: 'CREATOR' as const },
  } as never);

const publishedVideo = {
  id: 'video-1',
  status: 'READY',
  moderationStatus: 'PENDING',
  submittedForPublicationAt: null,
};

describe('story.getExportVideo', () => {
  it('returns null when the export has no assetUrl', async () => {
    const prisma = makePrisma({ exportAssetUrl: null });
    await expect(caller(prisma).story.getExportVideo({ exportId: 'e1' })).resolves.toBeNull();
    expect(prisma.videoFind).not.toHaveBeenCalled();
  });

  it('returns null when no Video row matches the export assetUrl', async () => {
    const prisma = makePrisma({ exportAssetUrl: 'https://cdn/out.mp4', videos: [] });
    await expect(caller(prisma).story.getExportVideo({ exportId: 'e1' })).resolves.toBeNull();
  });

  it('returns the row for a published export', async () => {
    const prisma = makePrisma({ exportAssetUrl: 'https://cdn/out.mp4', videos: [publishedVideo] });
    await expect(caller(prisma).story.getExportVideo({ exportId: 'e1' })).resolves.toEqual({
      videoId: 'video-1',
      status: 'READY',
      moderationStatus: 'PENDING',
      submittedForPublicationAt: null,
    });
  });

  it("scopes the export lookup to the caller's own rows", async () => {
    const prisma = makePrisma({ exportAssetUrl: 'https://cdn/out.mp4', videos: [publishedVideo] });
    await caller(prisma).story.getExportVideo({ exportId: 'e1' });
    expect(prisma.exportFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'e1', userId: 'u1' }) }),
    );
    expect(prisma.videoFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ creatorId: 'u1', mp4Url: 'https://cdn/out.mp4' }) }),
    );
  });

  it('asks for the newest row when an mp4Url is shared', async () => {
    const prisma = makePrisma({ exportAssetUrl: 'https://cdn/out.mp4', videos: [publishedVideo] });
    await caller(prisma).story.getExportVideo({ exportId: 'e1' });
    expect(prisma.videoFind).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });
});
