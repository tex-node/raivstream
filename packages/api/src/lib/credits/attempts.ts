import type { PrismaClient } from '@raivstream/database';
import { creditKeys } from './idempotencyKeys';

/**
 * The charge attempt for a production asset (2026-11-05).
 *
 * `creditKeys.prodAsset.charge(assetId, attempt)` includes the RETRY attempt, which restarts at 1
 * on every run. Reusing an asset row across runs therefore replayed key `...:<id>:1`:
 * `deductCredits` treated it as a duplicate and wrote nothing, while the provider was billed
 * again. The guard `assertNotResetAfterCharge` cannot help — it lives in the take path and refuses
 * a RESET, while this path never resets: it re-renders a row that is already FAILED or READY.
 *
 * So the attempt must be derived from the row's own charge history, not from a loop counter that
 * begins again at 1. Reading the history is deliberate: it is the only durable record that this
 * asset has already been paid for once.
 */
export async function nextChargeAttempt(prisma: PrismaClient, assetId: string): Promise<number> {
  const prefix = `${creditKeys.prodAsset.charge(assetId, 0).replace(/:0$/, '')}:`;
  const rows = (await prisma.creditTransaction.findMany({
    where: { idempotencyKey: { startsWith: prefix } },
    select: { idempotencyKey: true },
  })) as Array<{ idempotencyKey: string | null }>;

  const attempts = rows
    .map((row) => Number(String(row.idempotencyKey ?? '').split(':').pop()))
    .filter((value) => Number.isFinite(value) && value > 0);

  return attempts.length > 0 ? Math.max(...attempts) + 1 : 1;
}
