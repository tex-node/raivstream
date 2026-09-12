/**
 * Durable, crash-safe provider-webhook processing for FAL media jobs.
 *
 * Failure path (single DB transaction):
 *   1. Atomic terminal transition of the GenerationJob
 *      (`updateMany WHERE status IN (QUEUED, GENERATING)`).
 *   2. Creation of a durable refund intent in `CreditOperation` with a UNIQUE
 *      `idempotencyKey` (`fal-refund:<jobId>`).
 * Because both commit together, a crash after commit leaves a discoverable
 * PENDING intent; a crash before commit leaves neither.
 *
 * Refund execution (`executeRefundOperation`) claims an operation with an atomic
 * conditional update and performs the balance mutation + REFUND ledger row +
 * COMPLETED mark in ONE transaction. A crash mid-execution rolls the whole
 * transaction back, so retrying is financially neutral. Duplicate/concurrent
 * callers cannot both claim an operation.
 *
 * `retryPendingRefundOperations` is the minimal retry-safe recovery entry point
 * (invoke from a periodic scheduler — no new queue architecture).
 */

import type { PrismaClient } from '@raivstream/database';

const NON_TERMINAL_STATUSES = ['QUEUED', 'GENERATING'] as const;
const CLAIMABLE_STATUSES = ['PENDING', 'FAILED'] as const;

/** Credit rate key for the FAL image path (metadata only; no new price). */
export const FAL_IMAGE_FEATURE_KEY = 'generate:fal_image';

/** Maximum refund-execution attempts before an operation stays FAILED for review. */
export const FAL_REFUND_MAX_ATTEMPTS = 5;

export function falProviderJobKey(requestId: string): string {
  return `fal:${requestId}`;
}

/** Stable unique refund idempotency key, e.g. `fal-refund:<generationJobId>`. */
export function falRefundIdempotencyKey(jobId: string): string {
  return `fal-refund:${jobId}`;
}

/** Backwards-compatible alias used as the CreditTransaction referenceId. */
export const falRefundReference = falRefundIdempotencyKey;

export type ProviderWebhookOutcome = 'APPLIED' | 'JOB_NOT_FOUND' | 'ALREADY_TERMINAL';

export interface ProcessProviderWebhookResult {
  handled: boolean;
  outcome: ProviderWebhookOutcome;
  refundIntentCreated: boolean;
  refundExecuted: boolean;
}

export interface ProviderWebhookInput {
  providerJobId: string;
  outcome: 'completed' | 'failed';
  outputUrl?: string | null;
  errorMessage?: string | null;
  featureKey?: string;
}

export interface RefundExecutionResult {
  executed: boolean;
  reason: 'COMPLETED' | 'ZERO_AMOUNT' | 'NOT_CLAIMABLE' | 'MISSING' | 'FAILED';
}

type ExecuteRefundFn = (prisma: PrismaClient, idempotencyKey: string) => Promise<RefundExecutionResult>;

function redactError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'refund execution failed';
  return message.replace(/\s+/g, ' ').slice(0, 300);
}

export async function processProviderWebhook(
  prisma: PrismaClient,
  input: ProviderWebhookInput,
  deps: { executeRefund?: ExecuteRefundFn } = {},
): Promise<ProcessProviderWebhookResult> {
  const executeRefund = deps.executeRefund ?? executeRefundOperation;

  const job = await prisma.generationJob.findFirst({ where: { providerJobId: input.providerJobId } });
  if (!job) {
    return { handled: false, outcome: 'JOB_NOT_FOUND', refundIntentCreated: false, refundExecuted: false };
  }

  const jobData =
    input.outcome === 'completed'
      ? { status: 'COMPLETED' as const, outputUrl: input.outputUrl ?? job.outputUrl, errorMessage: null }
      : { status: 'FAILED' as const, errorMessage: input.errorMessage ?? 'Provider reported failure' };

  const outcome = await prisma.$transaction(async (tx) => {
    const transition = await tx.generationJob.updateMany({
      where: { id: job.id, status: { in: [...NON_TERMINAL_STATUSES] } },
      data: jobData,
    });
    if (transition.count === 0) {
      return { applied: false, intentKey: null as string | null };
    }

    let intentKey: string | null = null;
    if (input.outcome === 'failed' && job.creditsUsed > 0) {
      intentKey = falRefundIdempotencyKey(job.id);
      await tx.creditOperation.upsert({
        where: { idempotencyKey: intentKey },
        update: {},
        create: {
          idempotencyKey: intentKey,
          type: 'REFUND',
          status: 'PENDING',
          userId: job.userId,
          generationJobId: job.id,
          featureKey: input.featureKey ?? FAL_IMAGE_FEATURE_KEY,
          amount: job.creditsUsed,
          referenceId: intentKey,
        },
      });
    }
    return { applied: true, intentKey };
  });

  if (!outcome.applied) {
    return { handled: false, outcome: 'ALREADY_TERMINAL', refundIntentCreated: false, refundExecuted: false };
  }

  let refundExecuted = false;
  if (outcome.intentKey) {
    const exec = await executeRefund(prisma, outcome.intentKey);
    refundExecuted = exec.executed;
  }

  return {
    handled: true,
    outcome: 'APPLIED',
    refundIntentCreated: Boolean(outcome.intentKey),
    refundExecuted,
  };
}

/**
 * Executes (or retries) one refund operation atomically. Safe under duplicate,
 * concurrent, and post-crash invocation: the claim is a single conditional
 * update and the ledger mutation commits with the COMPLETED mark.
 */
export async function executeRefundOperation(
  prisma: PrismaClient,
  idempotencyKey: string,
): Promise<RefundExecutionResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const claim = await tx.creditOperation.updateMany({
        where: { idempotencyKey, status: { in: [...CLAIMABLE_STATUSES] } },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });
      if (claim.count === 0) return { executed: false, reason: 'NOT_CLAIMABLE' as const };

      const op = await tx.creditOperation.findUnique({ where: { idempotencyKey } });
      if (!op) return { executed: false, reason: 'MISSING' as const };

      if (op.amount <= 0) {
        await tx.creditOperation.update({
          where: { id: op.id },
          data: { status: 'COMPLETED', completedAt: new Date(), lastError: null },
        });
        return { executed: true, reason: 'ZERO_AMOUNT' as const };
      }

      const updated = await tx.creditBalance.upsert({
        where: { userId: op.userId },
        create: { userId: op.userId, balance: op.amount },
        update: { balance: { increment: op.amount } },
      });
      const balanceAfter = updated.balance;
      const balanceBefore = balanceAfter - op.amount;

      await tx.creditTransaction.create({
        data: {
          userId: op.userId,
          amount: op.amount,
          type: 'REFUND',
          featureKey: op.featureKey,
          description: 'Refund: fal generation failed',
          referenceId: op.referenceId ?? idempotencyKey,
          balanceBefore,
          balanceAfter,
        },
      });

      await tx.creditOperation.update({
        where: { id: op.id },
        data: { status: 'COMPLETED', completedAt: new Date(), lastError: null },
      });
      return { executed: true, reason: 'COMPLETED' as const };
    });
  } catch (error) {
    // The mutation rolled back, so the operation is still claimable. Record a
    // redacted failure for observability; retrying remains financially neutral.
    try {
      await prisma.creditOperation.update({
        where: { idempotencyKey },
        data: { status: 'FAILED', lastError: redactError(error) },
      });
    } catch {
      /* best-effort */
    }
    return { executed: false, reason: 'FAILED' };
  }
}

/**
 * Recovery entry point: executes all claimable refund operations. Invoke from a
 * periodic scheduler (cron/route) so post-crash PENDING/FAILED intents complete.
 */
export async function retryPendingRefundOperations(
  prisma: PrismaClient,
  limit = 25,
): Promise<{ processed: number; executed: number }> {
  const ops = await prisma.creditOperation.findMany({
    where: { status: { in: [...CLAIMABLE_STATUSES] }, attempts: { lt: FAL_REFUND_MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { idempotencyKey: true },
  });

  let executed = 0;
  for (const op of ops) {
    const result = await executeRefundOperation(prisma, op.idempotencyKey);
    if (result.executed) executed += 1;
  }
  return { processed: ops.length, executed };
}
