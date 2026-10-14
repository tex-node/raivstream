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
  FLUX2:          'generate:flux2',          // fal.ai FLUX.2 image
  FLUX2_EDIT:     'generate:flux2_edit',     // fal.ai FLUX.2 edit (Track D Layer 1; flag-gated)
  FLUX_KONTEXT:   'generate:flux_kontext',   // fal.ai FLUX Pro Kontext image-conditioned
  H3_MAX:         'generate:h3_max',         // fal.ai MiniMax H3-Max I2V
  VEED_FABRIC:    'generate:veed_fabric',    // fal.ai VEED Fabric talking-video
};

export const STORY_MOVIE_RENDER_FEATURE_KEY = 'story:movie_render';

/** Balance below this is surfaced as a "low balance warning" before generation. */
export const LOW_BALANCE_THRESHOLD = 500;

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

// Phase 9B.2 interface boundary only — no TTS/audio-generation provider is
// implemented in this phase (brief §27/§29). These feature keys exist so any
// FUTURE paid speech/audio-generation path has a fail-closed rate lookup
// ready before a single line of provider code is written. Production rates
// are intentionally NOT configured in this phase; a missing/inactive rate
// must reject the operation rather than silently proceed for free.
export const STORY_SPEECH_GENERATION_FEATURE_KEY = 'story:speech_generation';
export const STORY_AUDIO_GENERATION_FEATURE_KEY = 'story:audio_generation';
export const STORY_BACKGROUND_MUSIC_FEATURE_KEY = 'story:background_music';

export type FeatureCreditRateResult =
  | { configured: true;  cost: number; errorCode: null }
  | { configured: false; cost: 0;      errorCode: 'RATE_MISSING' | 'RATE_INVALID' };

/**
 * Generic fail-closed credit-rate resolver, generalizing the pattern proven
 * in resolveMovieRenderCreditRate for `story:movie_render`. Distinguishes a
 * missing row from an inactive/zero-cost row (each is diagnosable
 * separately) and is a pure read — zero side effects, zero writes, on every
 * path, including the "not configured" paths.
 */
export async function resolveFeatureCreditRate(
  prisma: PrismaClient,
  featureKey: string,
): Promise<FeatureCreditRateResult> {
  const rate = await prisma.featureCreditRate.findUnique({
    where:  { featureKey },
    select: { creditsPerUnit: true, isActive: true },
  });
  if (!rate) {
    return { configured: false, cost: 0, errorCode: 'RATE_MISSING' };
  }
  if (!rate.isActive || rate.creditsPerUnit <= 0) {
    return { configured: false, cost: 0, errorCode: 'RATE_INVALID' };
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

// ─── Structured insufficient-credit error (R16-01) ───────────────────────────
//
// The client renders a consistent "you need X, you have Y" message. The
// machine-readable payload travels on the tRPC error `cause` and is projected
// into `data.credit` by the router errorFormatter (packages/api/src/trpc.ts).
// It is per-user and never leaks another user's balance.

export interface InsufficientCreditsPayload {
  required: number;
  balance: number;
  shortfall: number;
  featureKey: string;
}

export function insufficientCreditsError(
  featureKey: string,
  required: number,
  balance: number,
): TRPCError {
  const payload: InsufficientCreditsPayload = {
    required,
    balance,
    shortfall: Math.max(0, required - balance),
    featureKey,
  };
  return new TRPCError({
    code:    'PAYMENT_REQUIRED',
    message: `Insufficient credits — you need ${required} but have ${balance}. Top up at /credits.`,
    cause:   { credit: payload },
  });
}

// ─── Idempotency helpers (A1) ────────────────────────────────────────────────

type CreditTxKind = 'USAGE' | 'REFUND';

/**
 * Reject reuse of an idempotency key for a different logical operation. A key
 * is only transparently replayable when it belongs to the same user, the same
 * feature and the same transaction kind.
 */
function assertIdempotentReplay(
  existing: { userId: string; featureKey: string | null; type: string; amount: number },
  expected: { userId: string; featureKey: string; kind: CreditTxKind },
): void {
  const sameOperation =
    existing.userId === expected.userId &&
    existing.featureKey === expected.featureKey &&
    existing.type === expected.kind;
  if (!sameOperation) {
    throw new TRPCError({
      code:    'CONFLICT',
      message: 'Idempotency key already used for a different operation.',
    });
  }
}

/**
 * Atomically deduct credits for a feature.
 * Throws PAYMENT_REQUIRED (with a structured `cause.credit` payload) if the
 * user has insufficient balance.
 * Throws INTERNAL_SERVER_ERROR if no active rate is configured.
 *
 * When `idempotencyKey` is supplied the operation is replay-safe: a second call
 * with the same key (sequential or concurrent) is a no-op that returns the
 * originally charged amount and performs no additional balance mutation. The
 * balance decrement and the ledger insert commit in one transaction, so a
 * concurrent duplicate's rollback also undoes its decrement.
 *
 * @returns The number of credits deducted (or originally deducted on replay).
 */
export async function deductCredits(
  prisma: PrismaClient,
  userId:      string,
  featureKey:  string,
  referenceId: string,
  description: string,
  idempotencyKey?: string,
): Promise<number> {
  // 0. Idempotent pre-check runs BEFORE the rate lookup: a replay must return
  //    the original charge even if the rate was since changed/deactivated.
  if (idempotencyKey) {
    const existing = await prisma.creditTransaction.findUnique({
      where:  { idempotencyKey },
      select: { userId: true, featureKey: true, type: true, amount: true },
    });
    if (existing) {
      assertIdempotentReplay(existing, { userId, featureKey, kind: 'USAGE' });
      return Math.abs(existing.amount);
    }
  }

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

  try {
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
        throw insufficientCreditsError(featureKey, cost, bal?.balance ?? 0);
      }

      // 3. Read back the new balance so we can record it accurately
      const updated = await tx.creditBalance.findUnique({
        where:  { userId },
        select: { balance: true },
      });
      const balanceAfter  = updated!.balance;
      const balanceBefore = balanceAfter + cost;

      // 4. Audit trail (the unique idempotencyKey guards against a concurrent duplicate)
      await tx.creditTransaction.create({
        data: {
          userId,
          amount:       -cost,
          type:         'USAGE',
          featureKey,
          description,
          referenceId,
          idempotencyKey: idempotencyKey ?? null,
          balanceBefore,
          balanceAfter,
        },
      });
    });
  } catch (error) {
    // 5. Concurrent duplicate → unique-constraint race. The transaction has
    //    rolled back (including its decrement); return the winner's charge.
    const code = (error as { code?: string } | null)?.code;
    if (idempotencyKey && code === 'P2002') {
      const existing = await prisma.creditTransaction.findUnique({
        where:  { idempotencyKey },
        select: { userId: true, featureKey: true, type: true, amount: true },
      });
      if (existing) {
        assertIdempotentReplay(existing, { userId, featureKey, kind: 'USAGE' });
        return Math.abs(existing.amount);
      }
    }
    throw error;
  }

  return cost;
}

/**
 * Refund credits back to a user (e.g. after a failed generation submission).
 * Creates a REFUND transaction row for full auditability.
 *
 * When `idempotencyKey` is supplied the refund is replay-safe: a second call
 * with the same key is a no-op, so a refund path that can be reached twice
 * (e.g. cancel racing a failure) neither double-credits nor double-logs.
 */
export async function refundCredits(
  prisma: PrismaClient,
  userId:      string,
  amount:      number,
  featureKey:  string,
  referenceId: string,
  description: string,
  idempotencyKey?: string,
): Promise<void> {
  if (idempotencyKey) {
    const existing = await prisma.creditTransaction.findUnique({
      where:  { idempotencyKey },
      select: { userId: true, featureKey: true, type: true, amount: true },
    });
    if (existing) {
      assertIdempotentReplay(existing, { userId, featureKey, kind: 'REFUND' });
      return;
    }
  }

  try {
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
          idempotencyKey: idempotencyKey ?? null,
          balanceBefore,
          balanceAfter,
        },
      });
    });
  } catch (error) {
    // Concurrent duplicate → the transaction rolled back; treat as replayed.
    const code = (error as { code?: string } | null)?.code;
    if (idempotencyKey && code === 'P2002') {
      const existing = await prisma.creditTransaction.findUnique({
        where:  { idempotencyKey },
        select: { userId: true, featureKey: true, type: true, amount: true },
      });
      if (existing) {
        assertIdempotentReplay(existing, { userId, featureKey, kind: 'REFUND' });
        return;
      }
    }
    throw error;
  }
}

// ─── Reserve → Settle → Release (Phase §7.5 — flag-guarded) ──────────────────
//
// Three-phase credit lifecycle: reserve an estimate at submit, settle to the
// actual amount on completion, release the hold on failure/cancel. Default OFF
// (CREDIT_RESERVE_SETTLE_ENABLED=false) — the existing deduct-before-submit +
// refund-on-failure path stays active until the financial policy is decided.

export function isReserveSettleEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CREDIT_RESERVE_SETTLE_ENABLED === 'true';
}

export interface ReserveCreditsInput {
  userId: string;
  featureKey: string;
  amount: number;
  idempotencyKey: string;
  referenceId: string;
  generationJobId?: string;
  description?: string;
}

/**
 * Reserve an estimated amount of credits. Atomic + idempotent: the first call
 * decrements the balance and creates a HELD reservation; later calls with the
 * same idempotencyKey return the existing reservation without double-charging.
 * Throws PAYMENT_REQUIRED if the balance is insufficient.
 */
export async function reserveCredits(
  prisma: PrismaClient,
  input: ReserveCreditsInput,
): Promise<number> {
  const existing = await prisma.creditReservation.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return existing.amount;

  try {
    return await prisma.$transaction(async (tx) => {
      const duplicate = await tx.creditReservation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (duplicate) return duplicate.amount;

      const result = await tx.creditBalance.updateMany({
        where: { userId: input.userId, balance: { gte: input.amount } },
        data:  { balance: { decrement: input.amount } },
      });
      if (result.count === 0) {
        const bal = await tx.creditBalance.findUnique({
          where:  { userId: input.userId },
          select: { balance: true },
        });
        throw new TRPCError({
          code:    'PAYMENT_REQUIRED',
          message: `Insufficient credits — you need ${input.amount} but have ${bal?.balance ?? 0}. Top up at /credits.`,
        });
      }

      const updated = await tx.creditBalance.findUnique({
        where:  { userId: input.userId },
        select: { balance: true },
      });
      const balanceAfter  = updated!.balance;
      const balanceBefore = balanceAfter + input.amount;

      await tx.creditTransaction.create({
        data: {
          userId: input.userId,
          amount:       -input.amount,
          type:         'USAGE',
          featureKey:   input.featureKey,
          description:  input.description ?? 'Credit reservation',
          referenceId:  input.referenceId,
          balanceBefore,
          balanceAfter,
        },
      });

      await tx.creditReservation.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          status:         'HELD',
          userId:         input.userId,
          generationJobId: input.generationJobId,
          featureKey:     input.featureKey,
          amount:         input.amount,
          referenceId:    input.referenceId,
        },
      });

      return input.amount;
    });
  } catch (error) {
    // Concurrent duplicate → unique constraint race; treat as idempotent success.
    const code = (error as { code?: string } | null)?.code;
    if (code === 'P2002') {
      const existing = await prisma.creditReservation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing.amount;
    }
    throw error;
  }
}

export interface SettleResult { settled: boolean; delta: number }

/**
 * Settle a HELD reservation to the actual amount. Atomic + idempotent: the
 * overage is refunded (delta > 0) or the underage is charged (delta < 0);
 * equal amounts are a no-op. A non-HELD reservation is a harmless no-op.
 */
export async function settleCredits(
  prisma: PrismaClient,
  idempotencyKey: string,
  actualAmount: number,
): Promise<SettleResult> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.creditReservation.findUnique({ where: { idempotencyKey } });
    if (!reservation || reservation.status !== 'HELD') return { settled: false, delta: 0 };

    const actual = Math.max(0, actualAmount);
    const delta = reservation.amount - actual; // >0 refund, <0 charge

    if (delta !== 0) {
      await tx.creditBalance.upsert({
        where:  { userId: reservation.userId },
        create: { userId: reservation.userId, balance: Math.max(0, delta) },
        update: { balance: { increment: delta } },
      });
      const updated = await tx.creditBalance.findUnique({
        where:  { userId: reservation.userId },
        select: { balance: true },
      });
      await tx.creditTransaction.create({
        data: {
          userId:       reservation.userId,
          amount:       delta,
          type:         delta > 0 ? 'REFUND' : 'USAGE',
          featureKey:   reservation.featureKey ?? undefined,
          description:  delta > 0 ? 'Credit settlement overage refund' : 'Credit settlement underage charge',
          referenceId:  reservation.referenceId ?? idempotencyKey,
          balanceBefore: (updated!.balance) - delta,
          balanceAfter:  updated!.balance,
        },
      });
    }

    await tx.creditReservation.update({
      where: { idempotencyKey },
      data:  { status: 'SETTLED', settledAmount: actual, settledAt: new Date() },
    });

    return { settled: true, delta };
  });
}

/**
 * Release a HELD reservation (failure/cancel) — refunds the full estimate.
 * Atomic + idempotent; a non-HELD reservation is a harmless no-op.
 */
export async function releaseCredits(
  prisma: PrismaClient,
  idempotencyKey: string,
): Promise<{ released: boolean }> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.creditReservation.findUnique({ where: { idempotencyKey } });
    if (!reservation || reservation.status !== 'HELD') return { released: false };

    const updated = await tx.creditBalance.upsert({
      where:  { userId: reservation.userId },
      create: { userId: reservation.userId, balance: reservation.amount },
      update: { balance: { increment: reservation.amount } },
    });
    const balanceAfter  = updated.balance;
    const balanceBefore = balanceAfter - reservation.amount;

    await tx.creditTransaction.create({
      data: {
        userId:       reservation.userId,
        amount:       reservation.amount,
        type:         'REFUND',
        featureKey:   reservation.featureKey ?? undefined,
        description:  'Credit reservation released',
        referenceId:  reservation.referenceId ?? idempotencyKey,
        balanceBefore,
        balanceAfter,
      },
    });

    await tx.creditReservation.update({
      where: { idempotencyKey },
      data:  { status: 'RELEASED', releasedAt: new Date() },
    });

    return { released: true };
  });
}

/**
 * Release HELD reservations that never settled or released (e.g. a process
 * crashed between reserve and settlement). Returns counts only — idempotent and
 * financially neutral for already-terminal reservations. Invoke from a
 * periodic scheduler (Phase 15 background cleanup).
 */
export async function releaseStuckReservations(
  prisma: PrismaClient,
  olderThanMs = 24 * 60 * 60 * 1000,
  limit = 100,
): Promise<{ scanned: number; released: number }> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stuck = await prisma.creditReservation.findMany({
    where: { status: 'HELD', createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { idempotencyKey: true },
  });

  let released = 0;
  for (const reservation of stuck) {
    const result = await releaseCredits(prisma, reservation.idempotencyKey);
    if (result.released) released += 1;
  }
  return { scanned: stuck.length, released };
}
