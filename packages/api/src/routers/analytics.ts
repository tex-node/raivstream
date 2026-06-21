import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { analytics, STORY_ANALYTICS_EVENTS } from '../lib/analytics';

const storyAnalyticsEventSchema = z.enum(STORY_ANALYTICS_EVENTS);
const analyticsPropertiesSchema = z.record(z.unknown()).default({});

export const analyticsRouter = router({
  trackStoryEvent: protectedProcedure
    .input(z.object({
      event: storyAnalyticsEventSchema,
      projectId: z.string().optional(),
      properties: analyticsPropertiesSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      await analytics.track(ctx.prisma, {
        event: input.event,
        userId: ctx.user.id,
        projectId: input.projectId,
        properties: {
          ...input.properties,
          audienceMode: ctx.isR16 ? 'KIDS' : input.properties.audienceMode,
        },
      });

      return { success: true };
    }),

  // Aggregate stats for the creator's channel
  overview: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'CREATOR') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Creator account required' });
    }

    const [videos, userStats] = await Promise.all([
      ctx.prisma.video.findMany({
        where: { creatorId: ctx.user.id, status: 'READY' },
        select: {
          viewCount: true,
          likeCount: true,
          avgStarRating: true,
          starRatingCount: true,
          engagementScore: true,
          completionRate: true,
        },
      }),
      ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { followerCount: true },
      }),
    ]);

    type VideoStats = { viewCount: number; likeCount: number; avgStarRating: number; starRatingCount: number; engagementScore: number; completionRate: number };
    const totalVideos = videos.length;
    const totalViews = videos.reduce((s: number, v: VideoStats) => s + v.viewCount, 0);
    const totalLikes = videos.reduce((s: number, v: VideoStats) => s + v.likeCount, 0);
    const ratedVideos = videos.filter((v: VideoStats) => v.starRatingCount > 0);
    const avgStarRating =
      ratedVideos.length > 0
        ? ratedVideos.reduce((s: number, v: VideoStats) => s + v.avgStarRating, 0) / ratedVideos.length
        : 0;
    const avgCompletionRate =
      totalVideos > 0
        ? videos.reduce((s: number, v: VideoStats) => s + v.completionRate, 0) / totalVideos
        : 0;
    const avgEngagementScore =
      totalVideos > 0
        ? videos.reduce((s: number, v: VideoStats) => s + v.engagementScore, 0) / totalVideos
        : 0;

    return {
      totalVideos,
      totalViews,
      totalLikes,
      followerCount: userStats?.followerCount ?? 0,
      avgStarRating,
      avgCompletionRate,
      avgEngagementScore,
    };
  }),

  // Daily view counts for the last N days (from watch history)
  dailyViews: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'CREATOR') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Creator account required' });
      }

      const since = new Date();
      since.setDate(since.getDate() - input.days);

      // Get all video IDs for this creator
      const creatorVideos = await ctx.prisma.video.findMany({
        where: { creatorId: ctx.user.id },
        select: { id: true },
      });
      const videoIds = creatorVideos.map((v) => v.id);

      if (videoIds.length === 0) return [];

      const history = await ctx.prisma.watchHistory.findMany({
        where: { videoId: { in: videoIds }, watchedAt: { gte: since } },
        select: { watchedAt: true },
      });

      // Group by date string (YYYY-MM-DD)
      const countMap: Record<string, number> = {};
      for (const entry of history) {
        const date = entry.watchedAt.toISOString().slice(0, 10);
        countMap[date] = (countMap[date] ?? 0) + 1;
      }

      // Build a continuous series for the last N days
      const result: Array<{ date: string; views: number }> = [];
      for (let i = input.days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const date = d.toISOString().slice(0, 10);
        result.push({ date, views: countMap[date] ?? 0 });
      }

      return result;
    }),

  // Per-video breakdown for the creator's analytics table
  videoBreakdown: protectedProcedure
    .input(
      z.object({
        sortBy: z
          .enum(['viewCount', 'likeCount', 'avgStarRating', 'engagementScore', 'publishedAt'])
          .default('publishedAt'),
        order: z.enum(['asc', 'desc']).default('desc'),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'CREATOR') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Creator account required' });
      }

      const videos = await ctx.prisma.video.findMany({
        where: {
          creatorId: ctx.user.id,
          ...(input.cursor ? { publishedAt: { lt: new Date(input.cursor) } } : {}),
        },
        orderBy: { [input.sortBy]: input.order },
        take: input.limit + 1,
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          mp4Url: true,
          hlsMasterUrl: true,
          status: true,
          isPremiumOnly: true,
          viewCount: true,
          likeCount: true,
          avgStarRating: true,
          engagementScore: true,
          completionRate: true,
          publishedAt: true,
        },
      });

      let nextCursor: string | undefined;
      if (videos.length > input.limit) {
        const last = videos.pop()!;
        nextCursor = last.publishedAt?.toISOString();
      }

      return { videos, nextCursor };
    }),
});
