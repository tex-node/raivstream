import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const videoCardSelect = {
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
  tags: true,
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

export const videoRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findUnique({
        where: { id: input.id },
        select: videoCardSelect,
      });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found' });
      return video;
    }),

  // Step 1 of upload: get a presigned PUT URL and create the pending video record
  requestUpload: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        contentType: z.string().startsWith('video/'),
        fileSizeBytes: z.number().positive().max(500 * 1024 * 1024), // 500 MB cap
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Create the video record first so we get a Prisma-generated id
      const video = await ctx.prisma.video.create({
        data: {
          creatorId: ctx.user.id,
          title: 'Untitled',
          thumbnailUrl: '',
          duration: 0,
          status: 'UPLOADING',
        },
      });

      const ext = input.filename.split('.').pop()?.toLowerCase() ?? 'mp4';
      const rawKey = `raw/${video.id}.${ext}`;

      // Store the raw key so confirmUpload can build the public URL
      await ctx.prisma.video.update({
        where: { id: video.id },
        data: { rawVideoUrl: rawKey },
      });

      const r2 = getR2Client();
      const uploadUrl = await getSignedUrl(
        r2,
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: rawKey,
          ContentType: input.contentType,
          // ContentLength intentionally omitted — browser XHR sets it automatically
          // and including it in the signed headers causes signature mismatch on some browsers
        }),
        { expiresIn: 3600 }
      );

      return { videoId: video.id, uploadUrl };
    }),

  // Step 2 of upload: confirm the PUT succeeded and make the video playable
  confirmUpload: protectedProcedure
    .input(
      z.object({
        videoId: z.string(),
        mode: z.literal('mvp'), // more modes (transcode) added later
      })
    )
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, creatorId: ctx.user.id },
      });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!video.rawVideoUrl) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No raw video key' });

      // MVP: serve the original upload directly from R2 CDN
      const mp4Url = `${process.env.R2_PUBLIC_URL}/${video.rawVideoUrl}`;

      await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: { status: 'READY', mp4Url },
      });

      return { success: true, mp4Url };
    }),

  // Step 3 of upload: set metadata and publish
  updateMetadata: protectedProcedure
    .input(
      z.object({
        videoId: z.string(),
        title: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        tags: z.array(z.string().max(50)).max(20).default([]),
        isPublic: z.boolean().default(true),
        isPremiumOnly: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, creatorId: ctx.user.id },
      });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND' });

      return ctx.prisma.video.update({
        where: { id: input.videoId },
        data: {
          title: input.title,
          description: input.description,
          tags: input.tags,
          isPublic: input.isPublic,
          isPremiumOnly: input.isPremiumOnly,
          publishedAt: new Date(),
        },
        select: { id: true, title: true, status: true },
      });
    }),

  // Creator's own videos list (for settings/analytics)
  myVideos: protectedProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const videos = await ctx.prisma.video.findMany({
        where: {
          creatorId: ctx.user.id,
          ...(input.cursor ? { publishedAt: { lt: new Date(input.cursor) } } : {}),
        },
        orderBy: { publishedAt: 'desc' },
        take: input.limit + 1,
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          status: true,
          viewCount: true,
          likeCount: true,
          avgStarRating: true,
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

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const videos = await ctx.prisma.video.findMany({
        where: {
          status: 'READY',
          isPublic: true,
          OR: [
            { title: { contains: input.query, mode: 'insensitive' } },
            { description: { contains: input.query, mode: 'insensitive' } },
            { tags: { has: input.query.toLowerCase() } },
            { creator: { username: { contains: input.query, mode: 'insensitive' } } },
          ],
          ...(input.cursor ? { publishedAt: { lt: new Date(input.cursor) } } : {}),
        },
        orderBy: [{ viewCount: 'desc' }, { publishedAt: 'desc' }],
        take: input.limit + 1,
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          viewCount: true,
          likeCount: true,
          publishedAt: true,
          creator: {
            select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true },
          },
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
