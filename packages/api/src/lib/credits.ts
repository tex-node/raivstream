/**
 * Credit deduction / refund helpers.
 *
 * All operations are atomic Prisma transactions that guarantee:
 *   - The balance never goes negative
 *   - Every deduction has a matching CreditTransaction row
 *   - Refunds are recorded separately (REFUND type) for auditability
 */

import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@raivstream/database';
import type { SupportedModel } from './generators';

// Map each generation model to its FeatureCreditRate featureKey (must match seed.ts)
export const MODEL_FEATURE_KEY: Record<SupportedModel, string> = {
  NANO_BANANA:    'generate:nano_banana',
  GROK_IMAGINE:   'generate:grok_imagine',
  LTX2:           'generate:ltx2',
  WAN_25:         'generate:wan_25',
  KLING_I2V:      'generate:kling_i2v',      // Kling image-to-video   — 500 credits
  KLING_R2V:      'generate:kling_r2v',      // Kling reference-to-video — 450 credits
  HIGGSFIELD:     'generate:higgsfield',
  VEO3:           'generate:veo3',
  FLUX:           'generate:flux',           // 80 credits
  HUNYUAN_VIDEO:  'generate:hunyuan_video',  // 300 credits (A100 GPU)
  COG_VIDEO_X:    'generate:cog_video_x',    // 250 credits
  SEEDANCE:       'generate:seedance',       // 200 credits
};

export const STORY_MOVIE_RENDER_FEATURE_KEY = 'story:movie_render';

export type MovieRenderCreditRateResult =
  | { configured: true;  cost: number; errorCode: null }
  | { configured: false; cost: 0;      errorCode: 'MOVIE_RENDER_RATE_MISSING' | 'MOVIE_RENDER_RATE_INVALID' };

export async function resolveMovieRenderCreditRate(
  prisma: PrismaClient,
): Promise<MovieRenderCreditRateResult> {
  const rate = await prisma.featureCreditRate.findUnique({
    where:  { featureKey: STORY_MOVIE_RENDER_FEATURE_KEY },
    select: { creditsPerUnit: true, isActive: true },
  });
  if (!rate) {
    return { configured: false, cost: 0, errorCode: 'MOVIE_RENDER_RATE_MISSING' };
  }
  if (!rate.isActive || rate.creditsPerUnit <= 0) {
    return { configured: false, cost: 0, errorCode: 'MOVIE_RENDER_RATE_INVALID' };
  }
  return { configured: true, cost: rate.creditsPerUnit, errorCode: null };
}

export async function getFeatureCreditCost(
  prisma: PrismaClient,
  featureKey: string,
): Promise<number> {
  const rate = await prisma.featureCreditRate.findUnique({
    where:  { featureKey },
    select: { creditsPerUnit: true, isActive: true },
  });

  if (!rate || !rate.isActive) return 0;
  return rate.creditsPerUnit;
}

/**
 * Atomically deduct credits for a feature.
 * Throws PAYMENT_REQUIRED if the user has insufficient balance.
 * Throws INTERNAL_SERVER_ERROR if no active rate is configured.
 *
 * @returns The number of credits deducted.
 */
export async function deductCredits(
  prisma: PrismaClient,
  userId:      string,
  featureKey:  string,
  referenceId: string,
  description: string,
): Promise<number> {
  // 1. Look up the configured cost for this feature
  const rate = await prisma.featureCreditRate.findUnique({
    where:  { featureKey },
    select: { creditsPerUnit: true, isActive: true },
  });

  if (!rate || !rate.isActive) {
    throw new TRPCError({
      code:    'INTERNAL_SERVER_ERROR',
      message: `No active credit rate configured for feature: ${featureKey}`,
    });
  }

  const cost = rate.creditsPerUnit;

  await prisma.$transaction(async (tx) => {
    // 2. Attempt an atomic decrement — only succeeds when balance >= cost
    const result = await tx.creditBalance.updateMany({
      where: { userId, balance: { gte: cost } },
      data:  { balance: { decrement: cost } },
    });

    if (result.count === 0) {
      // Either no balance row or not enough credits — fetch actual balance for the error message
      const bal = await tx.creditBalance.findUnique({
        where:  { userId },
        select: { balance: true },
      });
      throw new TRPCError({
        code:    'PAYMENT_REQUIRED',
        message: `Insufficient credits — you need ${cost} but have ${bal?.balance ?? 0}. Top up at /credits.`,
      });
    }

    // 3. Read back the new balance so we can record it accurately
    const updated = await tx.creditBalance.findUnique({
      where:  { userId },
      select: { balance: true },
    });
    const balanceAfter  = updated!.balance;
    const balanceBefore = balanceAfter + cost;

    // 4. Audit trail
    await tx.creditTransaction.create({
      data: {
        userId,
        amount:       -cost,
        type:         'USAGE',
        featureKey,
        description,
        referenceId,
        balanceBefore,
        balanceAfter,
      },
    });
  });

  return cost;
}

/**
 * Refund credits back to a user (e.g. after a failed generation submission).
 * Creates a REFUND transaction row for full auditability.
 */
export async function refundCredits(
  prisma: PrismaClient,
  userId:      string,
  amount:      number,
  featureKey:  string,
  referenceId: string,
  description: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.creditBalance.upsert({
      where:  { userId },
      create: { userId, balance: amount },
      update: { balance: { increment: amount } },
    });

    const balanceAfter  = updated.balance;
    const balanceBefore = balanceAfter - amount;

    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        type:         'REFUND',
        featureKey,
        description,
        referenceId,
        balanceBefore,
        balanceAfter,
      },
    });
  });
}
