import { router, protectedProcedure, publicProcedure } from '../trpc';
import { z } from 'zod';

// Shared select shape for video cards (includes cursor fields)
const videoSelect = {
  id: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  mp4Url: true,
  hlsMasterUrl: true,
  duration: true,
  viewCount: true,
  likeCount: true,
  dislikeCount: true,
  avgStarRating: true,
  starRatingCount: true,
  engagementScore: true,
  isPremiumOnly: true,  // needed by feed so the client can render lock overlays
  tags: true,
  publishedAt: true,
  creator: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      verified: true,
    },
  },
} as const;

const feedInput = z.object({
  cursor:    z.string().optional(),
  limit:     z.number().min(1).max(50).default(10),
  kidsOnly:  z.boolean().optional(), // true on r16.raivstream.com — filters isKidsSafe=true
});

// Extra where clause for kids-only mode
const kidsFilter = { isKidsSafe: true, moderationStatus: 'APPROVED' as const };

export const feedRouter = router({
  // For You — recent public ready videos (MVP: ordered by publishedAt)
  forYou: publicProcedure.input(feedInput).query(async ({ ctx, input }) => {
    const videos = await ctx.prisma.video.findMany({
      where: {
        status: 'READY',
        isPublic: true,
        ...(input.kidsOnly ? kidsFilter : { moderationStatus: { not: 'REJECTED' } }),
        ...(input.cursor ? { publishedAt: { lt: new Date(input.cursor) } } : {}),
      },
      orderBy: [{ engagementScore: 'desc' }, { publishedAt: 'desc' }],
      take: input.limit + 1,
      select: videoSelect,
    });

    let nextCursor: string | undefined;
    if (videos.length > input.limit) {
      const last = videos.pop()!;
      nextCursor = last.publishedAt?.toISOString();
    }

    return { videos, nextCursor };
  }),

  // Following — videos from creators the viewer follows
  following: protectedProcedure.input(feedInput).query(async ({ ctx, input }) => {
    const follows = await ctx.prisma.follow.findMany({
      where: { followerId: ctx.user.id },
      select: { followingId: true },
    });
    const followingIds = follows.map((f: { followingId: string }) => f.followingId);

    const videos = await ctx.prisma.video.findMany({
      where: {
        creatorId: { in: followingIds },
        status: 'READY',
        isPublic: true,
        moderationStatus: { not: 'REJECTED' },
        ...(input.cursor ? { publishedAt: { lt: new Date(input.cursor) } } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take: input.limit + 1,
      select: videoSelect,
    });

    let nextCursor: string | undefined;
    if (videos.length > input.limit) {
      const last = videos.pop()!;
      nextCursor = last.publishedAt?.toISOString();
    }

    return { videos, nextCursor };
  }),

  // Trending — highest engagement score
  trending: publicProcedure.input(feedInput).query(async ({ ctx, input }) => {
    const videos = await ctx.prisma.video.findMany({
      where: {
        status: 'READY',
        isPublic: true,
        ...(input.kidsOnly ? kidsFilter : { moderationStatus: { not: 'REJECTED' } }),
        ...(input.cursor ? { engagementScore: { lt: parseFloat(input.cursor) } } : {}),
      },
      orderBy: [{ engagementScore: 'desc' }, { publishedAt: 'desc' }],
      take: input.limit + 1,
      select: videoSelect,
    });

    let nextCursor: string | undefined;
    if (videos.length > input.limit) {
      const last = videos.pop()!;
      nextCursor = last.engagementScore?.toString();
    }

    return { videos, nextCursor };
  }),

  // Viewer's Pick — highest avg star rating with enough votes
  viewersPick: publicProcedure.input(feedInput).query(async ({ ctx, input }) => {
    const videos = await ctx.prisma.video.findMany({
      where: {
        status: 'READY',
        isPublic: true,
        starRatingCount: { gte: 3 },
        ...(input.kidsOnly ? kidsFilter : { moderationStatus: { not: 'REJECTED' } }),
        ...(input.cursor ? { avgStarRating: { lt: parseFloat(input.cursor) } } : {}),
      },
      orderBy: [{ avgStarRating: 'desc' }, { starRatingCount: 'desc' }],
      take: input.limit + 1,
      select: videoSelect,
    });

    let nextCursor: string | undefined;
    if (videos.length > input.limit) {
      const last = videos.pop()!;
      nextCursor = last.avgStarRating?.toString();
    }

    // If not enough rated videos, fall back to trending
    if (videos.length === 0) {
      const fallback = await ctx.prisma.video.findMany({
        where: { status: 'READY', isPublic: true, ...(input.kidsOnly ? kidsFilter : { moderationStatus: { not: 'REJECTED' } }) },
        orderBy: [{ viewCount: 'desc' }, { publishedAt: 'desc' }],
        take: input.limit,
        select: videoSelect,
      });
      return { videos: fallback, nextCursor: undefined };
    }

    return { videos, nextCursor };
  }),

  // Creator profile grid
  byCreator: publicProcedure
    .input(
      z.object({
        creatorId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const videos = await ctx.prisma.video.findMany({
        where: {
          creatorId: input.creatorId,
          status: 'READY',
          isPublic: true,
          moderationStatus: { not: 'REJECTED' },
          ...(input.cursor ? { publishedAt: { lt: new Date(input.cursor) } } : {}),
        },
        orderBy: { publishedAt: 'desc' },
        take: input.limit + 1,
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          viewCount: true,
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
