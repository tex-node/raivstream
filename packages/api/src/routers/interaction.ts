import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { PrismaClient } from '@raivstream/database';

// ─── Engagement score ─────────────────────────────────────────────────────────
//
// Called fire-and-forget after any interaction that changes a ranking signal.
//
// Formula:
//   raw   = views×1  +  likes×10  +  (avgStars × starCount)×5
//   score = raw × recencyBoost
//
//   recencyBoost = 1 / (1 + ageInDays / 7)   ← 7-day half-life
//
// This keeps fresh content surfacing while letting high-engagement older
// content remain discoverable. The score is stored on Video.engagementScore
// and used directly by the forYou feed query.
//
async function recomputeEngagementScore(
  prisma: PrismaClient,
  videoId: string,
): Promise<void> {
  const video = await prisma.video.findUnique({
    where:  { id: videoId },
    select: {
      viewCount:      true,
      likeCount:      true,
      avgStarRating:  true,
      starRatingCount: true,
      publishedAt:    true,
    },
  });
  if (!video) return;

  const ageInDays    = (Date.now() - video.publishedAt.getTime()) / 86_400_000;
  const recencyBoost = 1 / (1 + ageInDays / 7);
  const raw =
    video.viewCount      * 1.0 +
    video.likeCount      * 10.0 +
    video.avgStarRating  * video.starRatingCount * 5.0;

  await prisma.video.update({
    where: { id: videoId },
    data:  { engagementScore: Math.max(0, raw * recencyBoost) },
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const interactionRouter = router({

  // ── Likes ────────────────────────────────────────────────────────────────

  toggleLike: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.videoInteraction.findUnique({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
      });

      const wasLiked = existing?.liked ?? false;

      await ctx.prisma.videoInteraction.upsert({
        where:  { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        create: { userId: ctx.user.id, videoId: input.videoId, liked: true, disliked: false },
        update: { liked: !wasLiked, ...((!wasLiked) ? { disliked: false } : {}) },
      });

      await ctx.prisma.video.update({
        where: { id: input.videoId },
        data:  { likeCount: { increment: wasLiked ? -1 : 1 } },
      });

      // Fire-and-forget: engagement score + like notification
      recomputeEngagementScore(ctx.prisma, input.videoId).catch(() => {});

      if (!wasLiked) {
        ctx.prisma.video.findUnique({
          where:  { id: input.videoId },
          select: { creatorId: true },
        }).then((video) => {
          if (video && video.creatorId !== ctx.user.id) {
            return ctx.prisma.notification.create({
              data: {
                recipientId: video.creatorId,
                senderId:    ctx.user.id,
                type:        'LIKE',
                videoId:     input.videoId,
              },
            });
          }
        }).catch(() => {});
      }

      return { liked: !wasLiked };
    }),

  // ── Dislikes ─────────────────────────────────────────────────────────────

  toggleDislike: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.videoInteraction.findUnique({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
      });

      const wasDisliked = existing?.disliked ?? false;
      const wasLiked    = existing?.liked    ?? false;

      await ctx.prisma.videoInteraction.upsert({
        where:  { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        create: { userId: ctx.user.id, videoId: input.videoId, disliked: true, liked: false },
        update: { disliked: !wasDisliked, ...((!wasDisliked) ? { liked: false } : {}) },
      });

      await ctx.prisma.$transaction([
        ctx.prisma.video.update({
          where: { id: input.videoId },
          data:  { dislikeCount: { increment: wasDisliked ? -1 : 1 } },
        }),
        ...(wasLiked && !wasDisliked
          ? [ctx.prisma.video.update({
              where: { id: input.videoId },
              data:  { likeCount: { decrement: 1 } },
            })]
          : []),
      ]);

      recomputeEngagementScore(ctx.prisma, input.videoId).catch(() => {});
      return { disliked: !wasDisliked };
    }),

  // ── Star rating ───────────────────────────────────────────────────────────

  setRating: protectedProcedure
    .input(z.object({ videoId: z.string(), rating: z.number().int().min(1).max(5) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.videoInteraction.upsert({
        where:  { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        create: { userId: ctx.user.id, videoId: input.videoId, starRating: input.rating },
        update: { starRating: input.rating },
      });

      // Recompute denormalized avg + count from all ratings on this video
      const agg = await ctx.prisma.videoInteraction.aggregate({
        where:  { videoId: input.videoId, starRating: { not: null } },
        _avg:   { starRating: true },
        _count: { starRating: true },
      });

      await ctx.prisma.video.update({
        where: { id: input.videoId },
        data:  {
          avgStarRating:  agg._avg.starRating   ?? 0,
          starRatingCount: agg._count.starRating,
        },
      });

      recomputeEngagementScore(ctx.prisma, input.videoId).catch(() => {});
      return { rating: input.rating };
    }),

  // ── Guest view counting ───────────────────────────────────────────────────
  //
  // Signed-in users use trackProgress (which also writes WatchHistory).
  // This endpoint lets unauthenticated visitors contribute to viewCount so
  // trending / forYou feeds reflect actual traffic, not just logged-in views.
  //
  // Deduplication on the client: VideoCard only calls this once per video
  // activation via a ref — prevents duplicate pings from re-renders.
  //
  recordView: publicProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.userId) return { success: true }; // signed-in users use trackProgress

      await ctx.prisma.video.update({
        where: { id: input.videoId },
        data:  { viewCount: { increment: 1 } },
      });

      recomputeEngagementScore(ctx.prisma, input.videoId).catch(() => {});
      return { success: true };
    }),

  // ── Watch progress ────────────────────────────────────────────────────────

  trackProgress: protectedProcedure
    .input(
      z.object({
        videoId:          z.string(),
        watchTimeSeconds: z.number().int().min(0),
        completed:        z.boolean(),
        lastPosition:     z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const FREE_LIMIT = 10;

      // Single lookup reused for both episode-gate check and viewCount dedup
      const existing = await ctx.prisma.watchHistory.findUnique({
        where:  { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        select: { id: true },
      });
      const isFirstView = !existing;

      // Episode gate: FREE users only — block premium-only content after 10 unique videos
      if (ctx.user.premiumTier === 'FREE' && isFirstView) {
        const watched = await ctx.prisma.watchHistory.count({
          where: { userId: ctx.user.id },
        });
        if (watched >= FREE_LIMIT) {
          const vid = await ctx.prisma.video.findUnique({
            where:  { id: input.videoId },
            select: { isPremiumOnly: true },
          });
          if (vid?.isPremiumOnly) {
            throw new TRPCError({
              code:    'FORBIDDEN',
              message: 'EPISODE_GATE_REACHED',
            });
          }
        }
      }

      await ctx.prisma.watchHistory.upsert({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        create: {
          userId:       ctx.user.id,
          videoId:      input.videoId,
          watchTime:    input.watchTimeSeconds,
          completed:    input.completed,
          lastPosition: input.lastPosition,
        },
        update: {
          watchTime:    input.watchTimeSeconds,
          completed:    input.completed,
          lastPosition: input.lastPosition,
          watchedAt:    new Date(),
        },
      });

      // viewCount increments only on first watch per user, not on every progress ping
      if (isFirstView) {
        await ctx.prisma.video.update({
          where: { id: input.videoId },
          data:  { viewCount: { increment: 1 } },
        });
      }

      // Recompute engagement score async — don't block the response
      recomputeEngagementScore(ctx.prisma, input.videoId).catch(() => {});

      return { success: true };
    }),
});
