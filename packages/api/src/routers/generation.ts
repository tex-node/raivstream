import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { submitGenerationJob, pollJobStatus, cancelProviderJob, MODEL_META, MAX_JOB_RETRIES, type SupportedModel } from '../lib/generators';
import {
  deductCredits,
  refundCredits,
  reserveCredits,
  releaseCredits,
  settleCredits,
  resolveFeatureCreditRate,
  isReserveSettleEnabled,
  MODEL_FEATURE_KEY,
} from '../lib/credits';
import { getProviderRegistry, resolveModelAvailability } from '../lib/mediaProviders/registry';
import { moderatePrompt } from '../lib/promptModeration';
import { scanAndUpdateVideo } from '../lib/contentScanner';

const SUPPORTED_MODELS = [
  'NANO_BANANA', 'GROK_IMAGINE', 'LTX2', 'WAN_25',
  'KLING_I2V', 'KLING_R2V',
  'HIGGSFIELD', 'VEO3',
  'FLUX', 'HUNYUAN_VIDEO', 'COG_VIDEO_X', 'SEEDANCE',
  'FLUX2', 'H3_MAX', 'VEED_FABRIC',
] as const;

export const GENERATION_PROMPT_MAX_LENGTH = 2000;
export const NEGATIVE_PROMPT_MAX_LENGTH = 500;

/**
 * Reserve → submit → settle/release generation path (Phase §7.5). Flag-guarded
 * behind CREDIT_RESERVE_SETTLE_ENABLED; mirrors `create` but keys the credit
 * reservation by the job id, settles synchronously-completed jobs immediately,
 * and releases the reservation on submission failure.
 */
async function createWithReserveSettle(
  ctx: any,
  input: { model: string; prompt: string; negativePrompt?: string; duration?: number; aspectRatio?: string; style?: string; seedImageUrl?: string; audioUrl?: string },
  meta: (typeof MODEL_META)[SupportedModel],
  featureKey: string,
) {
  const rate = await resolveFeatureCreditRate(ctx.prisma, featureKey);
  if (!rate.configured) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `No active credit rate configured for feature: ${featureKey}` });
  }

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
      audioUrl:       input.audioUrl,
      status:         'QUEUED',
    },
  });

  const reservationKey = `reserve:${job.id}`;
  const creditsUsed = await reserveCredits(ctx.prisma, {
    userId:         ctx.user.id,
    featureKey,
    amount:         rate.cost,
    idempotencyKey: reservationKey,
    referenceId:    job.id,
    generationJobId: job.id,
    description:    `${meta.label} generation`,
  });
  await ctx.prisma.generationJob.update({ where: { id: job.id }, data: { creditsUsed } });

  try {
    const result = await submitGenerationJob({
      model:          input.model as SupportedModel,
      prompt:         input.prompt,
      negativePrompt: input.negativePrompt,
      duration:       input.duration,
      aspectRatio:    input.aspectRatio,
      seedImageUrl:   input.seedImageUrl,
      audioUrl:       input.audioUrl,
    });

    const updated = await ctx.prisma.generationJob.update({
      where: { id: job.id },
      data: {
        providerJobId: result.providerJobId,
        thumbnailUrl:  result.thumbnailUrl,
        outputUrl:     result.outputUrl,
        status:        result.outputUrl ? 'COMPLETED' : 'GENERATING',
      },
    });

    // Synchronous providers (e.g. Grok Imagine) complete immediately — settle now.
    if (result.outputUrl) {
      await settleCredits(ctx.prisma, reservationKey, creditsUsed).catch(() => {});
    }

    return updated;
  } catch (err) {
    await ctx.prisma.generationJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : 'Generation failed' },
    });
    await releaseCredits(ctx.prisma, reservationKey).catch(() => {});

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: err instanceof Error ? err.message : 'Generation failed',
    });
  }
}

export const generationRouter = router({

  /** List all models with their metadata + credit cost (public — used by the generate page) */
  listModels: publicProcedure.query(async ({ ctx }) => {
    // Pull active credit rates so the UI can display cost-per-generation
    const rates = await ctx.prisma.featureCreditRate.findMany({
      where:  { isActive: true },
      select: { featureKey: true, creditsPerUnit: true },
    });
    const rateMap = Object.fromEntries(rates.map((r) => [r.featureKey, r.creditsPerUnit]));
    const providers = getProviderRegistry();

    return Object.entries(MODEL_META)
      .filter(([, meta]) => !meta.hidden)
      .map(([id, meta]) => {
        const availability = resolveModelAvailability(providers, id);
        return {
          id,
          ...meta,
          creditCost: rateMap[MODEL_FEATURE_KEY[id as SupportedModel]] ?? null,
          ...(availability ? { available: availability.available, unavailableReason: availability.reason ?? null } : {}),
        };
      });
  }),

  /** Submit a new AI generation job */
  create: protectedProcedure
    .input(z.object({
      model:          z.enum(SUPPORTED_MODELS),
      // Optional only for VEED_FABRIC (image + audio driven); every other
      // model is prompt-driven and enforces it below.
      prompt:         z.string().min(3).max(GENERATION_PROMPT_MAX_LENGTH).optional(),
      negativePrompt: z.string().max(NEGATIVE_PROMPT_MAX_LENGTH).optional(),
      duration:       z.number().min(1).max(10).optional(),
      aspectRatio:    z.enum(['9:16', '16:9', '1:1', '4:3', '3:4']).optional(),
      style:          z.string().max(100).optional(),
      seedImageUrl:   z.string().url().optional(),
      audioUrl:       z.string().url().optional(),
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

      // ── Per-model input requirements ──────────────────────────────────────
      // VEED Fabric is image + audio driven (talking-video lip-sync); it needs
      // a presenter image and an audio track, not a text prompt. H3_MAX and the
      // Kling I2V/SEEDANCE I2V models need a seed image. Everything else needs
      // a prompt.
      const prompt = input.prompt ?? (input.model === 'VEED_FABRIC' ? 'Talking presenter video' : undefined);
      if (!prompt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A prompt is required for this model.' });
      }
      if (input.model === 'VEED_FABRIC') {
        if (!input.seedImageUrl) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'VEED Fabric requires a presenter image (seedImageUrl).' });
        }
        if (!input.audioUrl) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'VEED Fabric requires an audio track (audioUrl) to lip-sync against.' });
        }
      }
      if ((meta.requiresSeedImage || input.model === 'H3_MAX') && !input.seedImageUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `${meta.label} requires a seed image (seedImageUrl).` });
      }

      // ── Prompt moderation ─────────────────────────────────────────────────────
      // Runs BEFORE credit deduction — rejected prompts cost the user nothing.
      // VEED's canned default prompt is safe; only moderate caller-supplied text.
      if (input.prompt) {
        const moderation = await moderatePrompt(prompt);
        if (!moderation.allowed) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: moderation.reason ?? 'Your prompt violates our content guidelines.',
          });
        }
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

      // ── Reserve/settle path (flag-guarded, default OFF) ─────────────────────
      // Requires the financial policy decision; until then the deduct-first path
      // below remains the default.
      if (isReserveSettleEnabled()) {
        return createWithReserveSettle(ctx, { ...input, prompt }, meta, MODEL_FEATURE_KEY[input.model as SupportedModel]);
      }

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
          prompt,
          negativePrompt: input.negativePrompt,
          duration:       input.duration ?? 5,
          aspectRatio:    input.aspectRatio ?? '9:16',
          style:          input.style,
          seedImageUrl:   input.seedImageUrl,
          audioUrl:       input.audioUrl,
          status:         'QUEUED',
        },
      });

      try {
        // Submit to the provider
        const result = await submitGenerationJob({
          model:          input.model as SupportedModel,
          prompt,
          negativePrompt: input.negativePrompt,
          duration:       input.duration,
          aspectRatio:    input.aspectRatio,
          seedImageUrl:   input.seedImageUrl,
          audioUrl:       input.audioUrl,
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
          cancelled:  'CANCELLED',
        } as const;

        const updated = await ctx.prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status:       statusMap[remote.status],
            outputUrl:    remote.outputUrl ?? job.outputUrl,
            errorMessage: remote.error?.message ?? job.errorMessage,
            errorCode:    remote.status === 'failed' || remote.status === 'cancelled'
              ? (remote.error?.code ?? job.errorCode)
              : null,
          },
        });

        // Settle the credit reservation on completion (no-op unless reserve/settle
        // is enabled; idempotent). Actual-cost settlement awaits provider cost data.
        if (isReserveSettleEnabled() && remote.status === 'completed') {
          await settleCredits(ctx.prisma, `reserve:${job.id}`, job.creditsUsed).catch(() => {});
        }

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

      const updated = await ctx.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'CANCELLED' },
        select: { id: true, status: true },
      });

      // Best-effort provider-side cancel (fire-and-forget); the local status is
      // already CANCELLED regardless of whether the provider honours it.
      if (job.providerJobId) {
        cancelProviderJob(job.model as SupportedModel, job.providerJobId).catch(() => {});
      }

      return updated;
    }),

  /** Retry a failed generation job (Phase 15 — bounded provider retries) */
  retry: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.generationJob.findFirst({
        where: { id: input.jobId, userId: ctx.user.id },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      if (job.status !== 'FAILED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only failed jobs can be retried' });
      }
      if (job.retryCount >= MAX_JOB_RETRIES) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Retry limit reached (${MAX_JOB_RETRIES})` });
      }

      const meta = MODEL_META[job.model as SupportedModel];
      const featureKey = MODEL_FEATURE_KEY[job.model as SupportedModel];

      // Re-charge for the retry (the prior attempt was refunded/released).
      const creditsUsed = await deductCredits(
        ctx.prisma,
        ctx.user.id,
        featureKey,
        `retry-${job.id}-${Date.now()}`,
        `${meta.label} retry`,
      );

      await ctx.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'QUEUED', errorMessage: null, errorCode: null, retryCount: { increment: 1 } },
      });

      try {
        const result = await submitGenerationJob({
          model:          job.model as SupportedModel,
          prompt:         job.prompt,
          negativePrompt: job.negativePrompt ?? undefined,
          duration:       job.duration,
          aspectRatio:    job.aspectRatio,
          seedImageUrl:   job.seedImageUrl ?? undefined,
          audioUrl:       job.audioUrl ?? undefined,
        });

        return ctx.prisma.generationJob.update({
          where: { id: job.id },
          data: {
            providerJobId: result.providerJobId,
            thumbnailUrl:  result.thumbnailUrl,
            outputUrl:     result.outputUrl,
            status:        result.outputUrl ? 'COMPLETED' : 'GENERATING',
          },
        });
      } catch (err) {
        await ctx.prisma.generationJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : 'Retry failed' },
        });
        await refundCredits(ctx.prisma, ctx.user.id, creditsUsed, featureKey, job.id, `Refund: ${meta.label} retry failed`).catch(() => {});
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Retry failed',
        });
      }
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

      // Fire-and-forget content scan on the output image/video thumbnail
      const scanUrl = job.thumbnailUrl ?? job.outputUrl;
      if (scanUrl) {
        scanAndUpdateVideo(ctx.prisma as any, video.id, scanUrl).catch(() => {});
      }

      return video;
    }),
});
