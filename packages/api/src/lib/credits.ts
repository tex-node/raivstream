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
  NANO_BANANA:  'generate:nano_banana',
  GROK_IMAGINE: 'generate:grok_imagine',
  LTX2:         'generate:ltx2',
  WAN_25:       'generate:wan_25',
  KLING:        'generate:kling',
  HIGGSFIELD:   'generate:higgsfield',
};

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
