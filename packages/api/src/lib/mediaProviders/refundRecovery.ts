/**
 * Staging-only manual recovery for FAL refund operations.
 *
 * Pure/testable core for `scripts/fal-refund-recovery.ts`. Makes NO provider
 * calls and writes nothing to R2. It only drives the already-committed
 * `CreditOperation` outbox processor to finish pending/retryable refunds.
 *
 * Safety:
 *   - Requires an explicit `RAIVSTREAM_ENV=staging` marker; fails closed if the
 *     marker is missing or not "staging", or if NODE_ENV=production.
 *   - Refuses known production database hosts (defense in depth).
 *   - Emits only counts; never logs credentials, URLs, user data, or payloads.
 */

import type { PrismaClient } from '@raivstream/database';
import { executeRefundOperation, FAL_REFUND_MAX_ATTEMPTS } from './webhookProcessing';

export const DEFAULT_RECOVERY_LIMIT = 25;
export const MAX_RECOVERY_LIMIT = 100;

/** Minimum environment surface this command cares about. */
export interface RecoveryEnv {
  RAIVSTREAM_ENV?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
}

/** Production DB host fingerprints that must never be targeted. */
const PRODUCTION_DB_HOST_BLOCKLIST = ['172.18.0.2', 'db.raivstream.com'];

export class RecoveryGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryGuardError';
  }
}

/** Parses an optional limit with a safe default and hard bounding. */
export function parseRecoveryLimit(raw: string | undefined, max = MAX_RECOVERY_LIMIT): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_RECOVERY_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_RECOVERY_LIMIT;
  return Math.min(Math.max(parsed, 1), Math.max(max, 1));
}

/** Throws unless the environment is explicitly and safely staging. */
export function assertStagingEnvironment(env: RecoveryEnv = process.env as RecoveryEnv): void {
  const marker = env.RAIVSTREAM_ENV;
  if (!marker) {
    throw new RecoveryGuardError('RAIVSTREAM_ENV is not set (set RAIVSTREAM_ENV=staging)');
  }
  if (marker !== 'staging') {
    throw new RecoveryGuardError('RAIVSTREAM_ENV is not "staging"');
  }
  if (env.NODE_ENV === 'production') {
    throw new RecoveryGuardError('NODE_ENV=production is not allowed');
  }
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new RecoveryGuardError('DATABASE_URL is not set');
  }
  assertNotProductionDatabase(databaseUrl);
}

/** Throws if the database URL points at a known production host. */
export function assertNotProductionDatabase(databaseUrl: string): void {
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new RecoveryGuardError('DATABASE_URL is not a valid URL');
  }
  const blocked = PRODUCTION_DB_HOST_BLOCKLIST.some((h) => host === h || host.endsWith(`.${h}`));
  if (blocked) {
    throw new RecoveryGuardError('Refusing to run against a production database host');
  }
}

export interface RecoverySummary {
  found: number;
  completed: number;
  skipped: number;
  failed: number;
}

type ExecuteRefundFn = typeof executeRefundOperation;

/**
 * Processes pending/retryable refund operations and returns a concise summary.
 * "skipped" = no longer claimable (already handled/completed by another caller).
 */
export async function runRefundRecovery(
  prisma: PrismaClient,
  limit: number,
  deps: { executeRefund?: ExecuteRefundFn } = {},
): Promise<RecoverySummary> {
  const executeRefund = deps.executeRefund ?? executeRefundOperation;

  const operations = await prisma.creditOperation.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      attempts: { lt: FAL_REFUND_MAX_ATTEMPTS },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { idempotencyKey: true },
  });

  let completed = 0;
  let skipped = 0;
  let failed = 0;
  for (const operation of operations) {
    const result = await executeRefund(prisma, operation.idempotencyKey);
    if (result.executed) completed += 1;
    else if (result.reason === 'FAILED') failed += 1;
    else skipped += 1;
  }

  return { found: operations.length, completed, skipped, failed };
}

export interface RecoveryCommandDeps {
  prisma: PrismaClient;
  env?: RecoveryEnv;
  limitRaw?: string;
  log?: (message: string) => void;
  runRecovery?: (prisma: PrismaClient, limit: number) => Promise<RecoverySummary>;
}

/**
 * Runs the recovery command and returns a process exit code:
 *   0 = completed, 1 = unrecoverable runtime error, 2 = refused by staging guard.
 */
export async function executeRecoveryCommand(deps: RecoveryCommandDeps): Promise<number> {
  const log = deps.log ?? ((message: string) => console.log(message));

  try {
    assertStagingEnvironment(deps.env ?? (process.env as RecoveryEnv));
  } catch (error) {
    log(`refund-recovery: refused — ${error instanceof Error ? error.message : 'staging guard failed'}`);
    return 2;
  }

  const limit = parseRecoveryLimit(deps.limitRaw);
  try {
    const summary = await (deps.runRecovery ?? runRefundRecovery)(deps.prisma, limit);
    log(
      `refund-recovery: found=${summary.found} completed=${summary.completed} skipped=${summary.skipped} failed=${summary.failed}`,
    );
    return 0;
  } catch {
    log('refund-recovery: failed — unrecoverable error');
    return 1;
  }
}
