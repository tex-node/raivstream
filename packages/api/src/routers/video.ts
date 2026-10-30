import { router, protectedProcedure, publicProcedure, r16Procedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { scanAndUpdateVideo } from '../lib/contentScanner';
import { analytics } from '../lib/analytics';
import { invalidateFeedCaches } from '../lib/cache';

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // Disable automatic checksum headers — browsers can't compute them
    // and the mismatch causes the presigned PUT to fail
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
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
  isPremiumOnly: true,
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
      // §3 visibility: publicly, only APPROVED + public + not withdrawn + playable.
      // The owner always sees their own row; moderators/admins see everything.
      const isStaff = ctx.user?.role === 'ADMIN' || ctx.user?.role === 'MODERATOR';
      const video = isStaff
        ? await ctx.prisma.video.findUnique({ where: { id: input.id }, select: videoCardSelect })
        : await ctx.prisma.video.findFirst({
            where: {
              id: input.id,
              OR: [
                { moderationStatus: 'APPROVED', isPublic: true, withdrawnAt: null, status: 'READY' },
                ...(ctx.user ? [{ creatorId: ctx.user.id }] : []),
              ],
            },
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

      const updated = await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: {
          title: input.title,
          description: input.description,
          tags: input.tags,
          isPublic: input.isPublic,
          isPremiumOnly: input.isPremiumOnly,
          publishedAt: new Date(),
        },
        select: { id: true, title: true, status: true, thumbnailUrl: true, mp4Url: true },
      });

      // §1.5 — metadata affects what the feeds return; invalidate after the write.
      await invalidateFeedCaches();

      // Fire-and-forget content scan — does not block the response
      const scanUrl = updated.thumbnailUrl || updated.mp4Url;
      if (scanUrl) {
        scanAndUpdateVideo(ctx.prisma as any, updated.id, scanUrl).catch(() => {});
      }

      return { id: updated.id, title: updated.title, status: updated.status };
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
          mp4Url: true,
          hlsMasterUrl: true,
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

  delete: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, creatorId: ctx.user.id },
      });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found or not yours' });

      // Delete dependent records first to avoid FK constraint errors
      await ctx.prisma.$transaction(async (tx) => {
        await tx.videoInteraction.deleteMany({ where: { videoId: input.videoId } });
        await tx.watchHistory.deleteMany({ where: { videoId: input.videoId } });
        await tx.moderationLog.deleteMany({ where: { videoId: input.videoId } });
        await tx.videoCategory.deleteMany({ where: { videoId: input.videoId } });
        await tx.videoBadge.deleteMany({ where: { videoId: input.videoId } });
        await tx.featuredContent.deleteMany({ where: { videoId: input.videoId } });
        // Unlink generation job but keep the job record for audit trail
        await tx.generationJob.updateMany({
          where: { videoId: input.videoId },
          data: { videoId: null },
        });
        await tx.video.delete({ where: { id: input.videoId } });
      });

      // §1.5 — the video is gone; drop both feed caches after the delete commits.
      await invalidateFeedCaches();

      return { success: true };
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

  // ── Phase 4a — R16 publication lifecycle (creator-facing) ──────────────────
  // R16-only via r16Procedure (requireR16): publication scope is R16-only, and the
  // host is the reliable signal. Ownership is enforced inside each handler.

  /** Send a finished video for moderation. Leaves moderationStatus at PENDING. */
  submitForPublication: r16Procedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, creatorId: ctx.user.id },
      });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
      if (video.status !== 'READY') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Finish the video before sending it for review.' });
      }
      if (video.moderationStatus === 'APPROVED') {
        throw new TRPCError({ code: 'CONFLICT', message: 'This video is already live.' });
      }
      if (video.submittedForPublicationAt) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This video is already in review.' });
      }

      const updated = await ctx.prisma.video.update({
        where: { id: video.id },
        data: { submittedForPublicationAt: new Date(), moderationStatus: 'PENDING', withdrawnAt: null },
        select: { id: true, moderationStatus: true, submittedForPublicationAt: true },
      });
      await analytics.track(ctx.prisma, { event: 'video_submitted_for_publication', userId: ctx.user.id, properties: { videoId: video.id } });
      // §1.5 — submission can move a video into the feeds.
      await invalidateFeedCaches();
      return updated;
    }),

  /** Withdraw a submitted/live video from the R16 timeline (soft; keeps the row). */
  // Withdrawal is available on BOTH surfaces. A creator who can publish to the
  // main feed must be able to take it back; ownership (findFirst creatorId) is
  // the real scope, not the tier. Previously r16Procedure made this R16-only,
  // which was a one-way door on the less gated surface.
  withdrawPublication: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, creatorId: ctx.user.id },
      });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
      // "Live" means submitted for kids review OR published to the main feed -
      // general videos never get submittedForPublicationAt.
      if (!video.submittedForPublicationAt && !video.publishedAt) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This video is not live yet.' });
      }
      if (video.withdrawnAt) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This video is already withdrawn.' });
      }

      const updated = await ctx.prisma.video.update({
        where: { id: video.id },
        data: { withdrawnAt: new Date() },
        select: { id: true, moderationStatus: true, withdrawnAt: true },
      });
      await analytics.track(ctx.prisma, { event: 'video_publication_withdrawn', userId: ctx.user.id, properties: { videoId: video.id } });
      // §1.5 — a withdrawn video must leave both feeds immediately.
      await invalidateFeedCaches();
      return updated;
    }),

  /** Resubmit a rejected/withdrawn video: a fresh review cycle (clears the reason). */
  resubmitPublication: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, creatorId: ctx.user.id },
      });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
      if (video.moderationStatus !== 'REJECTED' && !video.withdrawnAt) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Only a not-approved or withdrawn video can be sent again.' });
      }

      // Kids videos re-enter the review queue. A general-feed video has no queue
      // to re-enter - clearing withdrawnAt restores it as it was - unless it was
      // REJECTED, which must go back through review rather than silently clear.
      const updated = await ctx.prisma.video.update({
        where: { id: video.id },
        data: video.isKidsSafe
          ? {
              submittedForPublicationAt: new Date(),
              withdrawnAt: null,
              moderationReason: null,
              moderationStatus: 'PENDING',
            }
          : video.moderationStatus === 'REJECTED'
            ? { withdrawnAt: null, moderationReason: null, moderationStatus: 'PENDING' }
            : { withdrawnAt: null },
        select: { id: true, moderationStatus: true, submittedForPublicationAt: true },
      });
      await analytics.track(ctx.prisma, { event: 'video_publication_resubmitted', userId: ctx.user.id, properties: { videoId: video.id } });
      // §1.5 — resubmission re-enters the review/feed path.
      await invalidateFeedCaches();
      return updated;
    }),

  /** Owner-only publication state for the creator UI (never exposes moderator notes). */
  publicationStatus: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .query(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, creatorId: ctx.user.id },
        select: {
          id: true,
          status: true,
          moderationStatus: true,
          submittedForPublicationAt: true,
          withdrawnAt: true,
          moderationReason: true,
          publishedAt: true,
          isKidsSafe: true,
        },
      });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
      return video;
    }),
});
