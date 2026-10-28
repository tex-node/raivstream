/**
 * Owned media listing for admin views.
 *
 * DEBT, still open: `routers/library.ts#getAssets` keeps its own copy of this
 * merge. Both were extended for StoryVideoExport here and there; they must be
 * collapsed. Marked rather than silently duplicated.
 *
 * Includes **StoryVideoExport** rows: the stitched final MP4 is what a school
 * actually submits, and it was previously invisible everywhere except the story
 * workspace.
 */

export type OwnedAsset = {
  id: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnailUrl?: string;
  /** Human-readable name, used for the download filename. */
  title: string;
  createdAt: Date;
  source: 'story' | 'studio' | 'upload' | 'generated' | 'export';
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
  const client = prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<Array<Record<string, never>>> }>;

  const take = input.limit + 1;
  const before = input.cursor ? new Date(input.cursor.createdAt) : null;
  const createdAtFilter = before ? { lt: before } : undefined;

  const wantImages = !input.type || input.type === 'image';
  const wantVideos = !input.type || input.type === 'video';
  const wantAudio = !input.type || input.type === 'audio';

  const [storyAssets, videos, audioAssets, exports] = await Promise.all([
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
          select: {
            id: true, assetUrl: true, thumbnailUrl: true, assetType: true, createdAt: true,
            scene: { select: { orderIndex: true } },
            project: { select: { title: true } },
          },
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
            title: true, status: true, createdAt: true, generationJob: { select: { id: true } },
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
    // Final stitched exports - the submission artefact.
    wantVideos
      ? client.storyVideoExport.findMany({
          where: { userId: ownerUserId, status: 'READY', assetUrl: { not: null }, ...(createdAtFilter ? { createdAt: createdAtFilter } : {}) },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          select: { id: true, assetUrl: true, createdAt: true, durationSeconds: true, project: { select: { title: true } } },
        })
      : Promise.resolve([]),
  ]);

  const merged: OwnedAsset[] = [];

  for (const asset of storyAssets as Array<Record<string, never>>) {
    if (!asset.assetUrl) continue;
    const sceneOrder = (asset.scene as { orderIndex?: number } | null)?.orderIndex;
    const projectTitle = (asset.project as { title?: string } | null)?.title;
    merged.push({
      id: String(asset.id),
      type: asset.assetType === 'VIDEO' ? 'video' : 'image',
      url: String(asset.assetUrl),
      ...(asset.thumbnailUrl ? { thumbnailUrl: String(asset.thumbnailUrl) } : {}),
      title: projectTitle
        ? (typeof sceneOrder === 'number' ? `${projectTitle} - Scene ${sceneOrder}` : projectTitle)
        : `Scene ${typeof sceneOrder === 'number' ? sceneOrder : 'clip'}`,
      createdAt: asset.createdAt as unknown as Date,
      source: 'story',
    });
  }

  for (const video of videos as Array<Record<string, never>>) {
    // MP4 first: an HLS manifest is not a downloadable file.
    const url = (video.mp4Url ?? video.hlsMasterUrl) as string | null;
    if (!url) continue;
    merged.push({
      id: String(video.id),
      type: 'video',
      url,
      ...(video.thumbnailUrl ? { thumbnailUrl: String(video.thumbnailUrl) } : {}),
      title: (video.title as string) ?? 'Video',
      createdAt: video.createdAt as unknown as Date,
      source: video.generationJob ? 'generated' : 'upload',
      ...(video.status === 'PROCESSING' ? { status: 'PROCESSING' } : {}),
    });
  }

  for (const audio of audioAssets as Array<Record<string, never>>) {
    if (!audio.publicUrl) continue;
    merged.push({
      id: String(audio.id),
      type: 'audio',
      url: String(audio.publicUrl),
      title: 'Audio',
      createdAt: audio.createdAt as unknown as Date,
      source: audio.projectId ? 'story' : 'studio',
    });
  }

  for (const exported of exports as Array<Record<string, never>>) {
    if (!exported.assetUrl) continue;
    const projectTitle = (exported.project as { title?: string } | null)?.title;
    merged.push({
      id: String(exported.id),
      type: 'video',
      url: String(exported.assetUrl),
      title: projectTitle ?? 'Final export',
      createdAt: exported.createdAt as unknown as Date,
      source: 'export',
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
