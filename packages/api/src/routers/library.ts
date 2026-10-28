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
import { scanAndUpdateVideo } from '../lib/contentScanner';
import { fetchOwnedAssets } from '../lib/mediaAssets';
import { router, protectedProcedure } from '../trpc';

const cursorSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().min(1),
});

export const libraryRouter = router({
  /**
   * Promote a completed story video asset to a feed Video row.
   *
   * `generation.publish` only works for generation jobs; a StorySceneAsset video
   * has no job, so without this the work is visible in the library and nowhere
   * else. Mirrors the publish contract: PENDING moderation plus a fire-and-forget
   * scan, so nothing reaches a feed without being queued for review.
   */
  publishAsset: protectedProcedure
    .input(z.object({
      assetId: z.string().min(1),
      title: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      isKidsSafe: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const asset = await ctx.prisma.storySceneAsset.findFirst({
        where: {
          id: input.assetId,
          userId: ctx.user.id,
          assetType: 'VIDEO',
          status: 'READY',
          assetUrl: { not: null },
        },
        select: { id: true, assetUrl: true, thumbnailUrl: true, durationSeconds: true },
      });

      // Covers "not yours", "not a video" and "not finished" with one message: the
      // distinction is not the client's business.
      if (!asset || !asset.assetUrl) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No publishable video asset with that id.' });
      }

      const duplicate = await ctx.prisma.video.findFirst({
        where: { creatorId: ctx.user.id, mp4Url: asset.assetUrl },
        select: { id: true },
      });
      if (duplicate) {
        throw new TRPCError({ code: 'CONFLICT', message: 'That video has already been published.' });
      }

      const video = await ctx.prisma.video.create({
        data: {
          creatorId: ctx.user.id,
          title: input.title.trim(),
          ...(input.description?.trim() ? { description: input.description.trim() } : {}),
          thumbnailUrl: asset.thumbnailUrl ?? asset.assetUrl,
          mp4Url: asset.assetUrl,
          duration: Math.max(1, Math.round(asset.durationSeconds ?? 5)),
          status: 'READY',
          isPublic: true,
          isKidsSafe: input.isKidsSafe,
          moderationStatus: 'PENDING',
          publishedAt: new Date(),
        },
        select: { id: true, moderationStatus: true },
      });

      // Fire-and-forget: the response must not wait on OpenAI.
      void scanAndUpdateVideo(ctx.prisma, video.id, asset.thumbnailUrl ?? asset.assetUrl);

      return video;
    }),
  getAssets: protectedProcedure
    .input(
      z.object({
        cursor: cursorSchema.optional(),
        limit: z.number().int().min(1).max(100).default(30),
        type: z.enum(['image', 'video', 'audio']).optional(),
        source: z.enum(['export']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Delegates to the shared implementation used by admin.getUserMedia, so the
      // two surfaces cannot drift. Everything the grid needs - StoryVideoExport
      // rows, human-readable titles, the type filters - lives there.
      return fetchOwnedAssets(ctx.prisma, ctx.user.id, input);
    }),
});