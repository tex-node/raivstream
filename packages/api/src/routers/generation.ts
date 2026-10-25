import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { submitGenerationJob, pollJobStatus, cancelProviderJob, MODEL_META, MAX_JOB_RETRIES, type SupportedModel } from '../lib/generators';
import { invalidateFeedCaches } from '../lib/cache';
import {
  deductCredits,
  refundCredits,
  reserveCredits,
  releaseCredits,
  settleCredits,
  compensateFailedGeneration,
  resolveFeatureCreditRate,
  isReserveSettleEnabled,
  isVideoPerSecondPricingEnabled,
  h3MaxFeatureKey,
  veedFabricFeatureKey,
  perSecondCredits,
  MODEL_FEATURE_KEY,
} from '../lib/credits';
import { getProviderRegistry, resolveModelAvailability } from '../lib/mediaProviders/registry';
import { moderatePrompt, moderationRejectMessage } from '../lib/promptModeration';
import { scanAndUpdateVideo } from '../lib/contentScanner';
import { estimateModelCreditCost, estimatePerSecondCosts } from '../lib/generationCost';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { getPublicUrlForKey } from '../lib/r2';
import {
  gateVeedFabricInputs,
  hashUrl,
  logVeedAudit,
  scanVeedFabricOutput,
} from '../lib/veedFabricSafety';

/**
 * D-001 — the only models that may create NEW jobs.
 *
 * This is the API boundary: `create` validates against this list, so a retired
 * model is rejected by the schema before any handler runs. Retired ids stay in
 * the `GenerationModel` enum (Postgres cannot drop values in place), in
 * `MODEL_META` (hidden, for admin/history), and in `MODEL_FEATURE_KEY` (needed
 * to refund historical jobs) — they simply cannot be selected any more.
 *
 * Retired: NANO_BANANA, GROK_IMAGINE, LTX2, WAN_25, KLING_I2V, KLING_R2V,
 *          HIGGSFIELD, VEO3, FLUX, HUNYUAN_VIDEO, COG_VIDEO_X, SEEDANCE.
 */
export const SUPPORTED_MODELS = ['FLUX2', 'H3_MAX', 'VEED_FABRIC'] as const;

export const GENERATION_PROMPT_MAX_LENGTH = 2000;
export const NEGATIVE_PROMPT_MAX_LENGTH = 500;

// ─── Attempt-scoped credit keys (A1/A2/A3) ───────────────────────────────────
//
// One logical generation attempt maps to one charge and at most one refund or
// reservation. The keys are deterministic for a given (job, attempt) so that a
// repeated/concurrent operation is a no-op rather than a double charge/refund.
// `attempt` = job.retryCount (0 for the initial attempt, n for the nth retry).

const chargeKey  = (jobId: string, attempt: number) => `gen:charge:${jobId}:${attempt}`;
const refundKey  = (jobId: string, attempt: number) => `gen:refund:${jobId}:${attempt}`;
const reserveKey = (jobId: string, attempt: number) => `reserve:${jobId}:${attempt}`;

/**
 * D-002 B.1 - R2 client for presigning (mirrors the local helper in video.ts).
 * Endpoint/credentials are read lazily so importing this module never throws.
 */
function getR2Client(): S3Client {
  // Same env var the working video upload uses. An earlier version derived the
  // endpoint from R2_ACCOUNT_ID, which is not set in production: that produced
  // "https://.r2.cloudflarestorage.com" and an immediate browser "Failed to
  // fetch" (DNS failure) rather than a signature error.
  const endpoint = process.env.R2_ENDPOINT;
  if (!endpoint) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'R2_ENDPOINT is not configured.',
    });
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

async function balanceOf(prisma: any, userId: string): Promise<number> {
  const row = await prisma.creditBalance.findUnique({
    where:  { userId },
    select: { balance: true },
  });
  return row?.balance ?? 0;
}

/**
 * Reserve → submit → settle/release generation path (Phase §7.5). Flag-guarded
 * behind CREDIT_RESERVE_SETTLE_ENABLED; mirrors `create` but keys the credit
 * reservation by the job id + attempt, settles synchronously-completed jobs
 * immediately, and releases the reservation on submission failure.
 */
async function createWithReserveSettle(
  ctx: any,
  input: { model: string; prompt: string; negativePrompt?: string; duration?: number; aspectRatio?: string; style?: string; seedImageUrl?: string; audioUrl?: string; resolution?: string },
  meta: (typeof MODEL_META)[SupportedModel],
  featureKey: string,
  unitCount = 1,
  veedGate: { image: string; audioSeconds: number | null; audioVerdict: 'allowed' | 'unknown'; audioReason?: string; transcriptHash?: string; transcriptEmpty?: boolean } | null = null,
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
      resolution:     input.resolution,
      status:         'QUEUED',
    },
  });

  // D-076 - audit with the REAL job id. The gate runs before the row exists (so
  // rejected media never creates a job), so its result is buffered and logged here.
  if (input.model === 'VEED_FABRIC' && veedGate) {
    logVeedAudit({
      userId: ctx.user.id,
      jobId: job.id,
      imageHash: hashUrl(input.seedImageUrl!),
      audioHash: hashUrl(input.audioUrl!),
      hashKind: 'url',
      consent: true,
      consentAt: new Date().toISOString(),
      verdict: 'allowed',
      detail: `path=per-second image=${veedGate.image} audioSeconds=${veedGate.audioSeconds ?? 'unknown'}`,
      audioVerdict: veedGate.audioVerdict,
      audioReason: veedGate.audioReason,
      transcriptHash: veedGate.transcriptHash,
      transcriptEmpty: veedGate.transcriptEmpty,
    });
  }

  const reservationKey = reserveKey(job.id, 0);
  let creditsUsed: number;
  try {
    creditsUsed = await reserveCredits(ctx.prisma, {
      userId:         ctx.user.id,
      featureKey,
      amount:         Math.ceil(rate.cost * unitCount),
      idempotencyKey: reservationKey,
      referenceId:    job.id,
      generationJobId: job.id,
      description:    `${meta.label} generation`,
    });
  } catch (err) {
    // Reservation failed (insufficient credits) — remove the never-charged job.
    await ctx.prisma.generationJob.delete({ where: { id: job.id } }).catch(() => {});
    throw err;
  }
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
      resolution:     input.resolution,
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

    return { ...updated, creditBalance: await balanceOf(ctx.prisma, ctx.user.id) };
  } catch (err) {
    await ctx.prisma.generationJob.updateMany({
      where: { id: job.id, status: { in: ['QUEUED', 'GENERATING'] } },
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
          // Per-second models are billed at a resolution-specific rate; mirror the
          // charge path (flag included) so the UI cannot under-report.
          creditCost: estimateModelCreditCost({
            model: id as SupportedModel,
            rateMap,
            perSecondEnabled: isVideoPerSecondPricingEnabled(),
          }),
          // D-002 B.1 - every resolution's price so the Avatar picker shows the
          // real number before the user picks one.
          ...(isVideoPerSecondPricingEnabled()
            ? { creditCostByResolution: estimatePerSecondCosts({ model: id as SupportedModel, rateMap }) }
            : {}),
          ...(availability ? { available: availability.available, unavailableReason: availability.reason ?? null } : {}),
        };
      });
  }),

  /**
   * D-002 B.1 - presigned audio upload for the Avatar surface.
   *
   * Pasting a URL is not a creator workflow. The client PUTs straight to R2 so
   * the file never passes through the API. The key is per-user and the extension
   * is allowlisted, so a caller cannot land an arbitrary object type in the bucket.
   */
  requestAudioUpload: protectedProcedure
    .input(z.object({
      filename: z.string().min(1).max(200),
      contentType: z.string().max(100),
      fileSizeBytes: z.number().positive().max(10 * 1024 * 1024),
    }))
    .mutation(async ({ ctx, input }) => {
      const ext = (input.filename.split('.').pop() ?? '').toLowerCase();
      const allowed = ['mp3', 'wav', 'm4a', 'aac', 'ogg'];
      if (!allowed.includes(ext)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Audio must be one of: ${allowed.join(', ')}.`,
        });
      }

      const key = `avatar-audio/${ctx.user.id}/${randomUUID()}.${ext}`;
      const client = getR2Client();
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: key,
          ContentType: input.contentType,
        }),
        { expiresIn: 900 },
      );

      return { key, uploadUrl, publicUrl: getPublicUrlForKey(key) };
    }),

  /** Submit a new AI generation job */
  create: protectedProcedure
    .input(z.object({
      model:          z.enum(SUPPORTED_MODELS),
      // Optional only for VEED_FABRIC (image + audio driven); every other
      // model is prompt-driven and enforces it below.
      prompt:         z.string().min(3).max(GENERATION_PROMPT_MAX_LENGTH).optional(),
      negativePrompt: z.string().max(NEGATIVE_PROMPT_MAX_LENGTH).optional(),
      duration:       z.number().min(1).max(15).optional(),
      aspectRatio:    z.enum(['9:16', '16:9', '1:1', '4:3', '3:4']).optional(),
      style:          z.string().max(100).optional(),
      seedImageUrl:   z.string().url().optional(),
      audioUrl:       z.string().url().optional(),
      resolution:     z.string().max(20).optional(),
      /**
       * D-076 — required for VEED_FABRIC. Set only by the UI consent checkbox
       * ("I confirm I have the rights and consent to use this image and audio").
       */
      consent:        z.boolean().optional(),
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
            message: moderationRejectMessage(moderation, 'Your prompt violates our content guidelines.'),
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

      // ── Per-second pricing path (VIDEO_PER_SECOND_PRICING flag, default OFF) ──
      // For H3_MAX and VEED_FABRIC, derive the per-resolution feature key and
      // compute the reserve amount from requested duration × rate/second.
      // D-076 - the per-second branch below returns early through
      // createWithReserveSettle, BEFORE the main Fabric gate. In production
      // VIDEO_PER_SECOND_PRICING is on, so that return bypassed every Fabric
      // safety check (consent, file types, image, Whisper). Gate the per-second
      // path explicitly so a pricing flag can never disable moderation.
      let perSecondGate: Awaited<ReturnType<typeof gateVeedFabricInputs>> | null = null;
      if (input.model === 'VEED_FABRIC' && isVideoPerSecondPricingEnabled()) {
        perSecondGate = await gateVeedFabricInputs({
          consent: input.consent,
          seedImageUrl: input.seedImageUrl!,
          audioUrl: input.audioUrl!,
          userId: ctx.user.id,
        });

      }
      const isPerSecond = isVideoPerSecondPricingEnabled();
      if (isPerSecond && (input.model === 'H3_MAX' || input.model === 'VEED_FABRIC')) {
        const effectiveResolution =
          input.model === 'H3_MAX'
            ? (input.resolution ?? '768P')
            : (input.resolution ?? '720p');
        const perSecKey = input.model === 'H3_MAX'
          ? h3MaxFeatureKey(effectiveResolution)
          : veedFabricFeatureKey(effectiveResolution);
        const unitCount = input.duration ?? 5;
        return createWithReserveSettle(
          ctx,
          { ...input, prompt, resolution: effectiveResolution },
          meta,
          perSecKey,
          unitCount,
          perSecondGate,
        );
      }

      // ── D-076 VEED Fabric input gate ─────────────────────────────────────────
      // Fabric is media-driven (no text prompt), so the uploaded image and audio
      // are the entire safety surface. Order: consent → file types → image →
      // audio → (job) → credits → submit. Runs before BOTH billing paths, so a
      // rejected request creates no job and charges nothing.
      let veedGate: Awaited<ReturnType<typeof gateVeedFabricInputs>> | null = null;
      if (input.model === 'VEED_FABRIC') {
        veedGate = await gateVeedFabricInputs({
          consent: input.consent,
          seedImageUrl: input.seedImageUrl!,
          audioUrl: input.audioUrl!,
          userId: ctx.user.id,
        });
      }
      // ─────────────────────────────────────────────────────────────────────────

      // ── Reserve/settle path (flag-guarded, default OFF) ─────────────────────
      // Requires the financial policy decision; until then the deduct-first path
      // below remains the default.
      if (isReserveSettleEnabled()) {
        return createWithReserveSettle(ctx, { ...input, prompt }, meta, MODEL_FEATURE_KEY[input.model as SupportedModel]);
      }

      const featureKey  = MODEL_FEATURE_KEY[input.model as SupportedModel];

      // Create a QUEUED job record first so the credit charge can be anchored to
      // a stable reference (job.id) and an attempt-scoped idempotency key.
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
          resolution:     input.resolution,
          status:         'QUEUED',
        },
      });

      // D-076 — audit trail for every Fabric job that passed the gate.
      if (input.model === 'VEED_FABRIC' && veedGate) {
        logVeedAudit({
          userId: ctx.user.id,
          jobId: job.id,
          imageHash: hashUrl(input.seedImageUrl!),
          audioHash: hashUrl(input.audioUrl!),
          hashKind: 'url',
          consent: true,
          consentAt: new Date().toISOString(),
          verdict: 'allowed',
          detail: `image=${veedGate.image} audioSeconds=${veedGate.audioSeconds ?? 'unknown'}`,
          audioVerdict: veedGate.audioVerdict,
          audioReason: veedGate.audioReason,
          transcriptHash: veedGate.transcriptHash,
          transcriptEmpty: veedGate.transcriptEmpty,
        });
      }

      // ── Credit gate ──────────────────────────────────────────────────────────
      // Charge BEFORE submitting so the user sees the balance updated immediately
      // and we never run a job for a user who can't pay.
      let creditsUsed: number;
      try {
        creditsUsed = await deductCredits(
          ctx.prisma,
          ctx.user.id,
          featureKey,
          job.id,
          `${meta.label} generation`,
          chargeKey(job.id, 0),
        );
      } catch (err) {
        // Insufficient credits or missing rate — remove the never-charged job and
        // surface the (structured) error unchanged.
        await ctx.prisma.generationJob.delete({ where: { id: job.id } }).catch(() => {});
        throw err;
      }
      await ctx.prisma.generationJob.update({ where: { id: job.id }, data: { creditsUsed } });
      // ─────────────────────────────────────────────────────────────────────────

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
          resolution:     input.resolution,
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

        return { ...updated, creditBalance: await balanceOf(ctx.prisma, ctx.user.id) };
      } catch (err) {
        // Mark job as failed (only if it did not already reach a terminal state,
        // e.g. a concurrent cancel) — never overwrite a terminal status.
        await ctx.prisma.generationJob.updateMany({
          where: { id: job.id, status: { in: ['QUEUED', 'GENERATING'] } },
          data: {
            status:       'FAILED',
            errorMessage: err instanceof Error ? err.message : 'Generation failed',
          },
        });

        // Refund credits — idempotent by attempt key, so a racing cancel cannot
        // double-refund. The provider rejected the submission before any GPU work ran
        await refundCredits(
          ctx.prisma,
          ctx.user.id,
          creditsUsed,
          featureKey,
          job.id,
          `Refund: ${meta.label} submission failed`,
          refundKey(job.id, 0),
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
        return { ...job, creditBalance: await balanceOf(ctx.prisma, ctx.user.id) };
      }

      // No provider job ID yet (still queued locally)
      if (!job.providerJobId) return { ...job, creditBalance: await balanceOf(ctx.prisma, ctx.user.id) };

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

        // D-043 — compensate on the outcome, not on the flag. settle/release are
        // no-ops unless a HELD reservation exists, and that hold may have been
        // created in a different request (or by a process that saw the flag on).
        const rk = reserveKey(job.id, job.retryCount);
        if (remote.status === 'completed') {
          await settleCredits(ctx.prisma, rk, job.creditsUsed).catch(() => {});

          // D-076 — best-effort output scan for Fabric. Fire-and-forget: the job
          // is already COMPLETED and charged, so this only informs review.
          if (job.model === 'VEED_FABRIC') {
            void scanVeedFabricOutput({
              videoUrl: updated.outputUrl ?? job.outputUrl ?? null,
              jobId: job.id,
              userId: ctx.user.id,
            });
          }
        } else if (remote.status === 'failed' || remote.status === 'cancelled') {
          await releaseCredits(ctx.prisma, rk).catch(() => {});
        }

        return { ...updated, creditBalance: await balanceOf(ctx.prisma, ctx.user.id) };
      } catch {
        return { ...job, creditBalance: await balanceOf(ctx.prisma, ctx.user.id) }; // last known state on polling error
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

      // Idempotent: an already-cancelled job is a no-op (never refund twice).
      if (job.status === 'CANCELLED') {
        return { id: job.id, status: 'CANCELLED' as const, creditBalance: await balanceOf(ctx.prisma, ctx.user.id) };
      }

      // Win the terminal transition exactly once. If a concurrent completion or
      // failure has already moved the job out of QUEUED/GENERATING, do NOT touch
      // credits — the other path owns the accounting outcome.
      const won = await ctx.prisma.generationJob.updateMany({
        where: { id: job.id, userId: ctx.user.id, status: { in: ['QUEUED', 'GENERATING'] } },
        data:  { status: 'CANCELLED' },
      });

      if (won.count > 0) {
        const attempt = job.retryCount;
        if (isReserveSettleEnabled()) {
          await releaseCredits(ctx.prisma, reserveKey(job.id, attempt)).catch(() => {});
        } else {
          const featureKey = MODEL_FEATURE_KEY[job.model as SupportedModel];
          await refundCredits(
            ctx.prisma,
            ctx.user.id,
            job.creditsUsed,
            featureKey,
            job.id,
            `Refund: ${MODEL_META[job.model as SupportedModel].label} cancelled`,
            refundKey(job.id, attempt),
          ).catch(() => {});
        }
      }

      // Best-effort provider-side cancel (fire-and-forget); the local status is
      // already CANCELLED regardless of whether the provider honours it.
      if (job.providerJobId) {
        cancelProviderJob(job.model as SupportedModel, job.providerJobId).catch(() => {});
      }

      return { id: job.id, status: 'CANCELLED' as const, creditBalance: await balanceOf(ctx.prisma, ctx.user.id) };
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
      const attempt = job.retryCount + 1;

      // Claim the retry exactly once: atomically flip FAILED → QUEUED and bump
      // retryCount only if it still equals the value we read. A concurrent retry
      // loses this race, so retryCount can never double-increment (A3).
      const claimed = await ctx.prisma.generationJob.updateMany({
        where: { id: job.id, userId: ctx.user.id, status: 'FAILED', retryCount: job.retryCount },
        data:  { status: 'QUEUED', errorMessage: null, errorCode: null, retryCount: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Retry already in progress for this job.' });
      }

      // Re-charge for the retry with an attempt-scoped, idempotent key (A1/A3).
      // The prior attempt was refunded/released before the job became FAILED.
      let creditsUsed: number;
      try {
        if (isReserveSettleEnabled()) {
          const rate = await resolveFeatureCreditRate(ctx.prisma, featureKey);
          if (!rate.configured) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `No active credit rate configured for feature: ${featureKey}` });
          }
          creditsUsed = await reserveCredits(ctx.prisma, {
            userId:          ctx.user.id,
            featureKey,
            amount:          rate.cost,
            idempotencyKey:  reserveKey(job.id, attempt),
            referenceId:     job.id,
            generationJobId: job.id,
            description:     `${meta.label} retry`,
          });
        } else {
          creditsUsed = await deductCredits(
            ctx.prisma,
            ctx.user.id,
            featureKey,
            job.id,
            `${meta.label} retry`,
            chargeKey(job.id, attempt),
          );
        }
      } catch (err) {
        // Release the claim so the user can retry once funds are available.
        await ctx.prisma.generationJob.updateMany({
          where: { id: job.id, retryCount: attempt, status: 'QUEUED' },
          data:  { status: 'FAILED', retryCount: job.retryCount },
        }).catch(() => {});
        throw err;
      }
      await ctx.prisma.generationJob.update({ where: { id: job.id }, data: { creditsUsed } });

      try {
        const result = await submitGenerationJob({
          model:          job.model as SupportedModel,
          prompt:         job.prompt,
          negativePrompt: job.negativePrompt ?? undefined,
          duration:       job.duration,
          aspectRatio:    job.aspectRatio,
          seedImageUrl:   job.seedImageUrl ?? undefined,
          audioUrl:       job.audioUrl ?? undefined,
          resolution:     job.resolution ?? undefined,
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

        if (result.outputUrl && isReserveSettleEnabled()) {
          await settleCredits(ctx.prisma, reserveKey(job.id, attempt), creditsUsed).catch(() => {});
        }

        return { ...updated, creditBalance: await balanceOf(ctx.prisma, ctx.user.id) };
      } catch (err) {
        await ctx.prisma.generationJob.updateMany({
          where: { id: job.id, status: { in: ['QUEUED', 'GENERATING'] } },
          data:  { status: 'FAILED', errorMessage: err instanceof Error ? err.message : 'Retry failed' },
        });
        // D-043 — release the hold if one exists, otherwise refund the deduct.
        // The flag no longer picks the strategy: picking by flag either stranded
        // a hold (flag off, reservation present) or double-compensated.
        await compensateFailedGeneration(ctx.prisma, {
          reservationKey:       reserveKey(job.id, attempt),
          userId:               ctx.user.id,
          creditsUsed,
          featureKey,
          referenceId:          job.id,
          description:          `Refund: ${meta.label} retry failed`,
          refundIdempotencyKey: refundKey(job.id, attempt),
        }).catch(() => {});
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

      // §1.5 — a published generation is a new feed member; invalidate after both
      // writes resolve so the cache cannot repopulate from a partial state.
      await invalidateFeedCaches();

      // Fire-and-forget content scan on the output image/video thumbnail
      const scanUrl = job.thumbnailUrl ?? job.outputUrl;
      if (scanUrl) {
        scanAndUpdateVideo(ctx.prisma as any, video.id, scanUrl).catch(() => {});
      }

      return video;
    }),
});
