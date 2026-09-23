import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { creativeProcedure, router } from '../../trpc';
import { projectService } from '../../lib/creative/project/service';
import { memoryService } from '../../lib/creative/memory/service';
import { isCreativeEnabled } from '../../lib/creative/featureFlags';
import { CreativeError } from '../../lib/creative/shared/errors';
import { CREATIVE_MEMORY_KINDS, CREATIVE_PROJECT_STATUSES, CREATIVE_PROJECT_TYPES } from '../../lib/creative/shared/types';

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'CREATIVE_DISABLED' || error.code === 'PROJECT_NOT_FOUND' ? (error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : 'FORBIDDEN') : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

export const creativeProjectRouter = router({
  create: creativeProcedure
    .input(z.object({
      text: z.string().min(1).max(4000),
      projectType: z.enum(CREATIVE_PROJECT_TYPES).optional(),
      legacyStoryProjectId: z.string().nullable().optional(),
      attachments: z.array(z.string().min(1).max(200)).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await projectService.createFromIntent(ctx.prisma, {
          userId: ctx.user.id,
          text: input.text,
          legacyStoryProjectId: input.legacyStoryProjectId,
          attachments: input.attachments,
          interpretation: input.projectType
            ? (await import('../../lib/creative/intent/service')).intentService.interpret(input.text, input.projectType)
            : undefined,
        });
      } catch (error) {
        throw toTrpcError(error, 'Project creation failed.');
      }
    }),

  list: creativeProcedure
    .query(async ({ ctx }) => {
      if (!isCreativeEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 is not enabled.' });
      return projectService.list(ctx.prisma, ctx.user.id);
    }),

  get: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await projectService.get(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Project not found.');
      }
    }),

  updateStatus: creativeProcedure
    .input(z.object({ projectId: z.string(), status: z.enum(CREATIVE_PROJECT_STATUSES) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await projectService.updateStatus(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, status: input.status });
      } catch (error) {
        throw toTrpcError(error, 'Status update failed.');
      }
    }),

  recordMemory: creativeProcedure
    .input(z.object({ projectId: z.string(), kind: z.enum(CREATIVE_MEMORY_KINDS), content: z.record(z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      await memoryService.record(ctx.prisma, { projectId: input.projectId, kind: input.kind, content: input.content });
      return { ok: true };
    }),

  getMemories: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await projectService.get(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      return memoryService.list(ctx.prisma, input.projectId);
    }),

  /**
   * Persist brand name or refinedIntent update from a DirectorPanel resolution.
   * Only touches the fields supplied; everything else is left alone.
   */
  updateBrief: creativeProcedure
    .input(z.object({
      projectId: z.string(),
      refinedIntent: z.string().min(1).max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const project = await ctx.prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: ctx.user.id } });
        if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
        if (input.refinedIntent !== undefined) {
          await ctx.prisma.creativeBrief.updateMany({ where: { projectId: input.projectId }, data: { refinedIntent: input.refinedIntent } });
        }
        return { ok: true };
      } catch (error) {
        throw toTrpcError(error, 'Brief update failed.');
      }
    }),

  /**
   * Step 1 of reference-asset upload: return a presigned R2 PUT URL.
   * The client PUTs the file directly to R2, then calls confirmAttachment.
   */
  requestAttachmentUpload: creativeProcedure
    .input(z.object({
      projectId: z.string(),
      fileName: z.string().min(1).max(200),
      contentType: z.string().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const project = await ctx.prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: ctx.user.id } });
        if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
        if (!process.env.R2_BUCKET_NAME || !process.env.R2_ENDPOINT) {
          throw new CreativeError('CREATIVE_DISABLED', 'Storage not configured.');
        }
        const ext = input.fileName.split('.').pop() ?? 'bin';
        const key = `creative-projects/${input.projectId}/sources/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const r2 = getR2Client();
        const uploadUrl = await getSignedUrl(r2, new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, ContentType: input.contentType }), { expiresIn: 3600 });
        return { uploadUrl, key };
      } catch (error) {
        throw toTrpcError(error, 'Could not prepare upload.');
      }
    }),

  /**
   * Step 2 of reference-asset upload: record the uploaded asset in brief.attachments.
   * The client calls this after the R2 PUT succeeds.
   */
  confirmAttachment: creativeProcedure
    .input(z.object({
      projectId: z.string(),
      key: z.string().min(1).max(500),
      label: z.string().min(1).max(200),
      kind: z.enum(['image', 'video']).default('image'),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const project = await ctx.prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: ctx.user.id }, include: { brief: true } });
        if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
        if (!process.env.R2_PUBLIC_URL) throw new CreativeError('CREATIVE_DISABLED', 'Storage not configured.');
        const url = `${process.env.R2_PUBLIC_URL}/${input.key}`;
        const existing = Array.isArray((project.brief as Record<string, unknown> | null)?.attachments)
          ? ((project.brief as Record<string, unknown>)?.attachments as Array<Record<string, unknown>>)
          : [];
        const newEntry = { id: `att-${Date.now()}`, label: input.label, kind: input.kind, origin: 'upload', url, addedAt: new Date().toISOString() };
        await ctx.prisma.creativeBrief.updateMany({
          where: { projectId: input.projectId },
          data: { attachments: [...existing, newEntry] as never },
        });
        return { ok: true, url };
      } catch (error) {
        throw toTrpcError(error, 'Could not confirm attachment.');
      }
    }),
});