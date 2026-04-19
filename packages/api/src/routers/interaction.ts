import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const interactionRouter = router({
  toggleLike: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.videoInteraction.findUnique({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
      });

      const wasLiked = existing?.liked ?? false;

      await ctx.prisma.videoInteraction.upsert({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        create: { userId: ctx.user.id, videoId: input.videoId, liked: true, disliked: false },
        update: { liked: !wasLiked, ...((!wasLiked) ? { disliked: false } : {}) },
      });

      // Update denormalized like count
      await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: { likeCount: { increment: wasLiked ? -1 : 1 } },
      });

      // Fire-and-forget like notification (only when newly liking, not unliking)
      if (!wasLiked) {
        ctx.prisma.video.findUnique({
          where:  { id: input.videoId },
          select: { creatorId: true },
        }).then((video) => {
          // Don't notify yourself
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

  toggleDislike: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.videoInteraction.findUnique({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
      });

      const wasDisliked = existing?.disliked ?? false;
      const wasLiked = existing?.liked ?? false;

      await ctx.prisma.videoInteraction.upsert({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        create: { userId: ctx.user.id, videoId: input.videoId, disliked: true, liked: false },
        update: { disliked: !wasDisliked, ...((!wasDisliked) ? { liked: false } : {}) },
      });

      // Update denormalized counts
      await ctx.prisma.$transaction([
        ctx.prisma.video.update({
          where: { id: input.videoId },
          data: { dislikeCount: { increment: wasDisliked ? -1 : 1 } },
        }),
        ...(wasLiked && !wasDisliked
          ? [ctx.prisma.video.update({
              where: { id: input.videoId },
              data: { likeCount: { decrement: 1 } },
            })]
          : []),
      ]);

      return { disliked: !wasDisliked };
    }),

  setRating: protectedProcedure
    .input(z.object({ videoId: z.string(), rating: z.number().int().min(1).max(5) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.videoInteraction.findUnique({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        select: { starRating: true },
      });

      await ctx.prisma.videoInteraction.upsert({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        create: { userId: ctx.user.id, videoId: input.videoId, starRating: input.rating },
        update: { starRating: input.rating },
      });

      // Recompute avg star rating on the video
      const agg = await ctx.prisma.videoInteraction.aggregate({
        where: { videoId: input.videoId, starRating: { not: null } },
        _avg: { starRating: true },
        _count: { starRating: true },
      });

      await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: {
          avgStarRating: agg._avg.starRating ?? 0,
          starRatingCount: agg._count.starRating,
        },
      });

      return { rating: input.rating };
    }),

  trackProgress: protectedProcedure
    .input(
      z.object({
        videoId: z.string(),
        watchTimeSeconds: z.number().int().min(0),
        completed: z.boolean(),
        lastPosition: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Episode gate — FREE users can watch 10 unique episodes before only
      // free content (isPremiumOnly=false) remains accessible.
      // Free content is NEVER blocked — only premium content throws after the limit.
      const FREE_LIMIT = 10;
      if (ctx.user.premiumTier === 'FREE') {
        const existing = await ctx.prisma.watchHistory.findUnique({
          where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
          select: { id: true },
        });

        if (!existing) {
          const watched = await ctx.prisma.watchHistory.count({
            where: { userId: ctx.user.id },
          });
          if (watched >= FREE_LIMIT) {
            // Only block premium content — free content remains playable forever
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
      }

      await ctx.prisma.watchHistory.upsert({
        where: { userId_videoId: { userId: ctx.user.id, videoId: input.videoId } },
        create: {
          userId: ctx.user.id,
          videoId: input.videoId,
          watchTime: input.watchTimeSeconds,
          completed: input.completed,
          lastPosition: input.lastPosition,
        },
        update: {
          watchTime: input.watchTimeSeconds,
          completed: input.completed,
          lastPosition: input.lastPosition,
          watchedAt: new Date(),
        },
      });

      // Bump view count on first interaction
      await ctx.prisma.video.updateMany({
        where: { id: input.videoId },
        data: { viewCount: { increment: 1 } },
      });

      return { success: true };
    }),
});
