/**
 * D-004 - Media Library, Phase 1 (read-only scoping).
 *
 * Three disjoint sources are merged in memory rather than unioned in SQL:
 * `StorySceneAsset` (story images/videos), `Video` (uploads + published
 * generations), `AudioAsset` (narration/music).
 *
 * APPROVED CAVEAT: this is correct but not scale-free. Every page reads up to
 * `limit + 1` rows from each of three tables. At current volumes (thousands per
 * user) that is fine; a library in the millions would need a materialised union
 * table, not a cleverer query.
 *
 * Pagination is a composite `(createdAt, id)` cursor, not an offset: two assets
 * can share a timestamp, and an offset would then skip or duplicate rows.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

export type LibraryAssetType = 'image' | 'video' | 'audio';
export type LibrarySource = 'story' | 'studio' | 'upload' | 'generated';

export interface LibraryAsset {
  id: string;
  type: LibraryAssetType;
  url: string;
  thumbnailUrl?: string;
  createdAt: Date;
  source: LibrarySource;
  /** Present for items that are visible but not yet playable. */
  status?: string;
}

const cursorSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().min(1),
});

/** Newest first, ties broken by id so the cursor is total. */
function compareAssets(a: LibraryAsset, b: LibraryAsset): number {
  const delta = b.createdAt.getTime() - a.createdAt.getTime();
  if (delta !== 0) return delta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export const libraryRouter = router({
  getAssets: protectedProcedure
    .input(
      z.object({
        cursor: cursorSchema.optional(),
        limit: z.number().int().min(1).max(100).default(30),
        type: z.enum(['image', 'video', 'audio']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const take = input.limit + 1;

      let before: Date | null = null;
      if (input.cursor) {
        before = new Date(input.cursor.createdAt);
        if (Number.isNaN(before.getTime())) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid cursor.' });
        }
      }

      const createdAtFilter = before ? { lt: before } : undefined;
      const wantImages = !input.type || input.type === 'image';
      const wantVideos = !input.type || input.type === 'video';
      const wantAudio = !input.type || input.type === 'audio';

      const [storyAssets, videos, audioAssets] = await Promise.all([
        wantImages || wantVideos
          ? ctx.prisma.storySceneAsset.findMany({
              where: {
                userId: ctx.user.id,
                status: 'READY',
                assetUrl: { not: null },
                ...(input.type === 'image' ? { assetType: 'IMAGE' as const } : {}),
                ...(input.type === 'video' ? { assetType: 'VIDEO' as const } : {}),
                ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take,
              select: { id: true, assetUrl: true, thumbnailUrl: true, assetType: true, createdAt: true },
            })
          : Promise.resolve([]),

        // READY is playable; PROCESSING is shown with a badge so a just-uploaded
        // video does not appear to have vanished. Anything else is hidden.
        wantVideos
          ? ctx.prisma.video.findMany({
              where: {
                creatorId: ctx.user.id,
                status: { in: ['READY', 'PROCESSING'] },
                ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take,
              select: {
                id: true,
                mp4Url: true,
                hlsMasterUrl: true,
                thumbnailUrl: true,
                status: true,
                createdAt: true,
                generationJob: { select: { id: true } },
              },
            })
          : Promise.resolve([]),

        wantAudio
          ? ctx.prisma.audioAsset.findMany({
              where: {
                userId: ctx.user.id,
                publicUrl: { not: null },
                ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take,
              select: { id: true, publicUrl: true, projectId: true, createdAt: true },
            })
          : Promise.resolve([]),
      ]);

      const merged: LibraryAsset[] = [];

      for (const asset of storyAssets) {
        if (!asset.assetUrl) continue;
        merged.push({
          id: asset.id,
          type: asset.assetType === 'VIDEO' ? 'video' : 'image',
          url: asset.assetUrl,
          ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
          createdAt: asset.createdAt,
          source: 'story',
        });
      }

      for (const video of videos) {
        const url = video.hlsMasterUrl ?? video.mp4Url;
        if (!url) continue;
        merged.push({
          id: video.id,
          type: 'video',
          url,
          ...(video.thumbnailUrl ? { thumbnailUrl: video.thumbnailUrl } : {}),
          createdAt: video.createdAt,
          // A published AI generation carries its GenerationJob back-link;
          // a plain upload does not.
          source: video.generationJob ? 'generated' : 'upload',
          ...(video.status === 'PROCESSING' ? { status: video.status } : {}),
        });
      }

      for (const audio of audioAssets) {
        if (!audio.publicUrl) continue;
        merged.push({
          id: audio.id,
          type: 'audio',
          url: audio.publicUrl,
          createdAt: audio.createdAt,
          // Creative 5.0 assets are project-less; story narration always has one.
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
    }),
});
