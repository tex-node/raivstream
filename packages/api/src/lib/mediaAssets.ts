/**
 * Track C - owned media listing, shared shape with `library.getAssets`.
 *
 * DEBT, recorded honestly: this duplicates the merge logic in
 * `routers/library.ts#getAssets` rather than extracting it. The extraction needs
 * the procedure body moved wholesale; doing that and shipping a UI in one pass
 * was the wrong risk trade. Both paths must stay in sync until they are merged.
 */

export type OwnedAsset = {
  id: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnailUrl?: string;
  createdAt: Date;
  source: 'story' | 'studio' | 'upload' | 'generated';
  status?: string;
};

export type OwnedAssetsInput = {
  type?: 'image' | 'video' | 'audio';
  cursor?: { createdAt: string; id: string };
  limit: number;
};

function compareAssets(a: OwnedAsset, b: OwnedAsset): number {
  const delta = b.createdAt.getTime() - a.createdAt.getTime();
  if (delta !== 0) return delta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export async function fetchOwnedAssets(
  prisma: unknown,
  ownerUserId: string,
  input: OwnedAssetsInput,
): Promise<{ items: OwnedAsset[]; nextCursor: { createdAt: string; id: string } | null }> {
  const client = prisma as {
    storySceneAsset: { findMany: (args: unknown) => Promise<Array<Record<string, never>>> };
    video: { findMany: (args: unknown) => Promise<Array<Record<string, never>>> };
    audioAsset: { findMany: (args: unknown) => Promise<Array<Record<string, never>>> };
  };

  const take = input.limit + 1;
  const before = input.cursor ? new Date(input.cursor.createdAt) : null;
  const createdAtFilter = before ? { lt: before } : undefined;

  const wantImages = !input.type || input.type === 'image';
  const wantVideos = !input.type || input.type === 'video';
  const wantAudio = !input.type || input.type === 'audio';

  const [storyAssets, videos, audioAssets] = await Promise.all([
    wantImages || wantVideos
      ? client.storySceneAsset.findMany({
          where: {
            userId: ownerUserId,
            status: 'READY',
            assetUrl: { not: null },
            ...(input.type === 'image' ? { assetType: 'IMAGE' } : {}),
            ...(input.type === 'video' ? { assetType: 'VIDEO' } : {}),
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          select: { id: true, assetUrl: true, thumbnailUrl: true, assetType: true, createdAt: true },
        })
      : Promise.resolve([]),
    wantVideos
      ? client.video.findMany({
          where: {
            creatorId: ownerUserId,
            status: { in: ['READY', 'PROCESSING'] },
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          select: {
            id: true, mp4Url: true, hlsMasterUrl: true, thumbnailUrl: true,
            status: true, createdAt: true, generationJob: { select: { id: true } },
          },
        })
      : Promise.resolve([]),
    wantAudio
      ? client.audioAsset.findMany({
          where: { userId: ownerUserId, publicUrl: { not: null }, ...(createdAtFilter ? { createdAt: createdAtFilter } : {}) },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          select: { id: true, publicUrl: true, projectId: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const merged: OwnedAsset[] = [];

  for (const asset of storyAssets as Array<Record<string, string | null | Date>>) {
    if (!asset.assetUrl) continue;
    merged.push({
      id: String(asset.id),
      type: asset.assetType === 'VIDEO' ? 'video' : 'image',
      url: String(asset.assetUrl),
      ...(asset.thumbnailUrl ? { thumbnailUrl: String(asset.thumbnailUrl) } : {}),
      createdAt: asset.createdAt as Date,
      source: 'story',
    });
  }

  for (const video of videos as Array<Record<string, unknown>>) {
    const url = (video.hlsMasterUrl ?? video.mp4Url) as string | null;
    if (!url) continue;
    merged.push({
      id: String(video.id),
      type: 'video',
      url,
      ...(video.thumbnailUrl ? { thumbnailUrl: String(video.thumbnailUrl) } : {}),
      createdAt: video.createdAt as Date,
      source: video.generationJob ? 'generated' : 'upload',
      ...(video.status === 'PROCESSING' ? { status: 'PROCESSING' } : {}),
    });
  }

  for (const audio of audioAssets as Array<Record<string, unknown>>) {
    if (!audio.publicUrl) continue;
    merged.push({
      id: String(audio.id),
      type: 'audio',
      url: String(audio.publicUrl),
      createdAt: audio.createdAt as Date,
      source: audio.projectId ? 'story' : 'studio',
    });
  }

  merged.sort(compareAssets);
  const page = merged.slice(0, input.limit);
  const last = page[page.length - 1];

  return {
    items: page,
    nextCursor:
      merged.length > input.limit && last
        ? { createdAt: last.createdAt.toISOString(), id: last.id }
        : null,
  };
}
