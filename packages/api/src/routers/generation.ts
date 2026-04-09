import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { submitGenerationJob, pollJobStatus, MODEL_META, type SupportedModel } from '../lib/generators';
import { deductCredits, refundCredits, MODEL_FEATURE_KEY } from '../lib/credits';
import { moderatePrompt } from '../lib/promptModeration';

const SUPPORTED_MODELS = ['NANO_BANANA', 'GROK_IMAGINE', 'LTX2', 'WAN_25', 'KLING', 'HIGGSFIELD', 'VEO3'] as const;

export const generationRouter = router({

  /** List all models with their metadata + credit cost (public — used by the generate page) */
  listModels: publicProcedure.query(async ({ ctx }) => {
    // Pull active credit rates so the UI can display cost-per-generation
    const rates = await ctx.prisma.featureCreditRate.findMany({
      where:  { isActive: true },
      select: { featureKey: true, creditsPerUnit: true },
    });
    const rateMap = Object.fromEntries(rates.map((r) => [r.featureKey, r.creditsPerUnit]));

    return Object.entries(MODEL_META).map(([id, meta]) => ({
      id,
      ...meta,
      creditCost: rateMap[MODEL_FEATURE_KEY[id as SupportedModel]] ?? null,
    }));
  }),

  /** Submit a new AI generation job */
  create: protectedProcedure
    .input(z.object({
      model:          z.enum(SUPPORTED_MODELS),
      prompt:         z.string().min(3).max(500),
      negativePrompt: z.string().max(300).optional(),
      duration:       z.number().min(1).max(10).optional(),
      aspectRatio:    z.enum(['9:16', '16:9', '1:1', '4:3', '3:4']).optional(),
      style:          z.string().max(100).optional(),
      seedImageUrl:   z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check model availability
      const meta = MODEL_META[input.model as SupportedModel];
      if (meta.badge === 'coming-soon') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${meta.label} is coming soon and not yet available for generation.`,
        });
      }

      // ── Prompt moderation ─────────────────────────────────────────────────────
      // Runs BEFORE credit deduction — rejected prompts cost the user nothing.
      const moderation = await moderatePrompt(input.prompt);
      if (!moderation.allowed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: moderation.reason ?? 'Your prompt violates our content guidelines.',
        });
      }
      // Also check negative prompt if provided
      if (input.negativePrompt) {
        const negMod = await moderatePrompt(input.negativePrompt);
        if (!negMod.allowed) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: negMod.reason ?? 'Your negative prompt violates our content guidelines.',
          });
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      // ── Credit gate ──────────────────────────────────────────────────────────
      // Deduct credits BEFORE creating the job so the user sees the balance
      // updated immediately and we never run a job for a user who can't pay.
      const featureKey  = MODEL_FEATURE_KEY[input.model as SupportedModel];
      // We use a placeholder referenceId here — we'll update the job record after creation
      const creditJobId = `pending-${ctx.user.id}-${Date.now()}`;
      const creditsUsed = await deductCredits(
        ctx.prisma,
        ctx.user.id,
        featureKey,
        creditJobId,
        `${meta.label} generation`,
      );
      // ─────────────────────────────────────────────────────────────────────────

      // Create a QUEUED job record so the UI can show progress immediately
      const job = await ctx.prisma.generationJob.create({
        data: {
          userId:         ctx.user.id,
          model:          input.model,
          prompt:         input.prompt,
          negativePrompt: input.negativePrompt,
          duration:       input.duration ?? 5,
          aspectRatio:    input.aspectRatio ?? '9:16',
          style:          input.style,
          seedImageUrl:   input.seedImageUrl,
          status:         'QUEUED',
        },
      });

      try {
        // Submit to the provider
        const result = await submitGenerationJob({
          model:          input.model as SupportedModel,
          prompt:         input.prompt,
          negativePrompt: input.negativePrompt,
          duration:       input.duration,
          aspectRatio:    input.aspectRatio,
          seedImageUrl:   input.seedImageUrl,
        });

        // Update the job with provider details
        const updated = await ctx.prisma.generationJob.update({
          where: { id: job.id },
          data: {
            providerJobId: result.providerJobId,
            thumbnailUrl:  result.thumbnailUrl,
            outputUrl:     result.outputUrl,
            status:        result.outputUrl ? 'COMPLETED' : 'GENERATING',
          },
        });

        return updated;
      } catch (err) {
        // Mark job as failed
        await ctx.prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status:       'FAILED',
            errorMessage: err instanceof Error ? err.message : 'Generation failed',
          },
        });

        // Refund credits — the provider rejected the submission before any GPU work ran
        await refundCredits(
          ctx.prisma,
          ctx.user.id,
          creditsUsed,
          featureKey,
          job.id,
          `Refund: ${meta.label} submission failed`,
        ).catch(() => {
          // Log but don't swallow the original error
          console.error(`[credits] Failed to refund ${creditsUsed} credits to user ${ctx.user.id} for job ${job.id}`);
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Generation failed',
        });
      }
    }),

  /** Poll the status of a running generation job */
  pollStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.prisma.generationJob.findFirst({
        where: { id: input.jobId, userId: ctx.user.id },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });

      // Already in a terminal state — return immediately
      if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        return job;
      }

      // No provider job ID yet (still queued locally)
      if (!job.providerJobId) return job;

      try {
        const remote = await pollJobStatus(job.model as SupportedModel, job.providerJobId);

        const statusMap = {
          queued:     'QUEUED',
          generating: 'GENERATING',
          completed:  'COMPLETED',
          failed:     'FAILED',
        } as const;

        const updated = await ctx.prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status:       statusMap[remote.status],
            outputUrl:    remote.outputUrl ?? job.outputUrl,
            errorMessage: remote.error ?? job.errorMessage,
          },
        });

        return updated;
      } catch {
        return job; // return last known state on polling error
      }
    }),

  /** List the current user's generation history */
  myJobs: protectedProcedure
    .input(z.object({
      limit:  z.number().min(1).max(50).default(20),
      cursor: z.string().optional(),
      status: z.enum(['QUEUED', 'GENERATING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const jobs = await ctx.prisma.generationJob.findMany({
        where: {
          userId: ctx.user.id,
          ...(input.status ? { status: input.status } : {}),
          ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        select: {
          id: true,
          model: true,
          prompt: true,
          status: true,
          outputUrl: true,
          thumbnailUrl: true,
          aspectRatio: true,
          duration: true,
          errorMessage: true,
          videoId: true,
          createdAt: true,
        },
      });

      const hasMore = jobs.length > input.limit;
      if (hasMore) jobs.pop();

      return {
        jobs,
        nextCursor: hasMore ? jobs[jobs.length - 1].createdAt.toISOString() : undefined,
      };
    }),

  /** Cancel a queued or generating job */
  cancel: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.generationJob.findFirst({
        where: { id: input.jobId, userId: ctx.user.id },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot cancel a finished job' });
      }

      return ctx.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'CANCELLED' },
        select: { id: true, status: true },
      });
    }),

  /** Publish a completed generated video to the feed */
  publish: protectedProcedure
    .input(z.object({
      jobId:         z.string(),
      title:         z.string().min(1).max(100),
      description:   z.string().max(500).optional(),
      tags:          z.array(z.string()).max(10).optional(),
      isPublic:      z.boolean().default(true),
      isPremiumOnly: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.generationJob.findFirst({
        where: { id: input.jobId, userId: ctx.user.id, status: 'COMPLETED' },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Completed job not found' });
      if (!job.outputUrl) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No output URL on job' });
      if (job.videoId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already published' });

      // Create a Video record linked to this generation job
      const video = await ctx.prisma.video.create({
        data: {
          creatorId:    ctx.user.id,
          title:        input.title,
          description:  input.description,
          tags:         input.tags ?? [],
          thumbnailUrl: job.thumbnailUrl ?? job.outputUrl,
          mp4Url:       job.outputUrl,
          duration:     Math.round(job.duration),
          aspectRatio:  job.aspectRatio,
          status:       'READY',
          isPublic:     input.isPublic,
          isPremiumOnly: input.isPremiumOnly,
          publishedAt:  new Date(),
        },
        select: { id: true, title: true, mp4Url: true, thumbnailUrl: true },
      });

      // Link the job to the video
      await ctx.prisma.generationJob.update({
        where: { id: job.id },
        data: { videoId: video.id },
      });

      return video;
    }),
});
