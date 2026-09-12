/**
 * Read-only observability for the FAL refund outbox (`CreditOperation`).
 *
 * Strictly additive and side-effect free: only count/aggregate/find queries.
 * It never changes claim eligibility, attempt limits, transaction boundaries,
 * balances, or ledger rows. Used by the admin operations surface, a future
 * dashboard, and alert-ready detection (no scheduler is added here).
 *
 * Categories (see runbook):
 *   recoverable  status IN (PENDING, FAILED) AND attempts < max
 *   exhausted    status = FAILED AND attempts >= max
 *   completed    status = COMPLETED (financially inert)
 *   staleFailed  status = FAILED AND updatedAt < now - staleThreshold
 */

import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@raivstream/database';
import { FAL_REFUND_MAX_ATTEMPTS } from './webhookProcessing';

export const DEFAULT_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h, named (not a magic number)
export const MAX_RECENT_FAILURES = 50;

export interface MonitorOptions {
  now?: Date;
  staleThresholdMs?: number;
  maxAttempts?: number;
  recentFailuresLimit?: number;
}

export interface UnresolvedOperationSummary {
  status: string;
  attempts: number;
  amount: number;
  ageMs: number;
  idempotencyKeyTag: string | null;
}

export interface RecentFailureSummary {
  idempotencyKeyTag: string;
  attempts: number;
  amount: number;
  updatedAt: string;
  errorCategory: string;
  errorPreview: string | null;
}

export interface RefundOperationsOverview {
  generatedAt: string;
  staleThresholdMs: number;
  maxAttempts: number;
  counts: {
    pending: number;
    failed: number;
    completed: number;
    recoverable: number;
    exhausted: number;
    staleFailed: number;
    total: number;
  };
  amounts: {
    awaitingRecovery: number;
    exhausted: number;
  };
  oldestUnresolved: UnresolvedOperationSummary | null;
  latestOperationAt: string | null;
  recentFailures: RecentFailureSummary[];
}

export function resolveStaleThresholdMs(
  env: { FAL_REFUND_STALE_THRESHOLD_MS?: string } = process.env as { FAL_REFUND_STALE_THRESHOLD_MS?: string },
): number {
  const raw = env.FAL_REFUND_STALE_THRESHOLD_MS;
  if (!raw) return DEFAULT_STALE_THRESHOLD_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STALE_THRESHOLD_MS;
}

/** Stable, non-reversible tag for an idempotency/reference key (never the raw key). */
export function tagIdempotencyKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const provider = key.split(':')[0]?.slice(0, 24) || 'key';
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 8);
  return `${provider}#${digest}`;
}

/** Redacts URLs, connection strings, emails, and long tokens from an error message. */
export function redactErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const redacted = String(raw)
    .replace(/(postgres(?:ql)?:\/\/)\S+/gi, '$1<redacted>')
    .replace(/https?:\/\/\S+/gi, '<redacted-url>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<redacted-email>')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '<redacted-token>')
    .replace(/\s+/g, ' ')
    .trim();
  return redacted.length ? redacted.slice(0, 200) : null;
}

export type ErrorCategory = 'TIMEOUT' | 'CONNECTION' | 'CONSTRAINT' | 'STORAGE' | 'PROVIDER' | 'UNKNOWN';

/** Coarse error classification for grouping/detection (no secret material). */
export function categorizeError(raw: string | null | undefined): ErrorCategory {
  if (!raw) return 'UNKNOWN';
  const text = raw.toLowerCase();
  if (/timeout|timed out|etimedout|abort/.test(text)) return 'TIMEOUT';
  if (/econn|connection|network|socket|enotfound|refused|unreachable/.test(text)) return 'CONNECTION';
  if (/unique|constraint|foreign key|violat|null value/.test(text)) return 'CONSTRAINT';
  if (/r2|s3|storage|bucket|putobject|upload/.test(text)) return 'STORAGE';
  if (/provider|fal|runpod|http 5|http 4|api error/.test(text)) return 'PROVIDER';
  return 'UNKNOWN';
}

function clampRecentLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || (limit as number) <= 0) return MAX_RECENT_FAILURES;
  return Math.min(limit as number, MAX_RECENT_FAILURES);
}

/** Bounded, read-only overview of refund operations. */
export async function getRefundOperationsOverview(
  prisma: PrismaClient,
  options: MonitorOptions = {},
): Promise<RefundOperationsOverview> {
  const now = options.now ?? new Date();
  const staleThresholdMs = options.staleThresholdMs ?? resolveStaleThresholdMs();
  const maxAttempts = options.maxAttempts ?? FAL_REFUND_MAX_ATTEMPTS;
  const staleCutoff = new Date(now.getTime() - staleThresholdMs);
  const recentLimit = clampRecentLimit(options.recentFailuresLimit);

  const unresolvedWhere: Prisma.CreditOperationWhereInput = { status: { in: ['PENDING', 'FAILED'] } };
  const recoverableWhere: Prisma.CreditOperationWhereInput = { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: maxAttempts } };
  const exhaustedWhere: Prisma.CreditOperationWhereInput = { status: 'FAILED', attempts: { gte: maxAttempts } };

  const [
    pending,
    failed,
    completed,
    recoverable,
    exhausted,
    staleFailed,
    awaitingAgg,
    exhaustedAgg,
    oldest,
    latest,
    failures,
  ] = await Promise.all([
    prisma.creditOperation.count({ where: { status: 'PENDING' } }),
    prisma.creditOperation.count({ where: { status: 'FAILED' } }),
    prisma.creditOperation.count({ where: { status: 'COMPLETED' } }),
    prisma.creditOperation.count({ where: recoverableWhere }),
    prisma.creditOperation.count({ where: exhaustedWhere }),
    prisma.creditOperation.count({ where: { status: 'FAILED', updatedAt: { lt: staleCutoff } } }),
    prisma.creditOperation.aggregate({ _sum: { amount: true }, where: recoverableWhere }),
    prisma.creditOperation.aggregate({ _sum: { amount: true }, where: exhaustedWhere }),
    prisma.creditOperation.findFirst({
      where: unresolvedWhere,
      orderBy: { createdAt: 'asc' },
      select: { status: true, attempts: true, amount: true, idempotencyKey: true, createdAt: true },
    }),
    prisma.creditOperation.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.creditOperation.findMany({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      take: recentLimit,
      select: { idempotencyKey: true, attempts: true, amount: true, updatedAt: true, lastError: true },
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    staleThresholdMs,
    maxAttempts,
    counts: {
      pending,
      failed,
      completed,
      recoverable,
      exhausted,
      staleFailed,
      total: pending + failed + completed,
    },
    amounts: {
      awaitingRecovery: awaitingAgg._sum?.amount ?? 0,
      exhausted: exhaustedAgg._sum?.amount ?? 0,
    },
    oldestUnresolved: oldest
      ? {
          status: oldest.status,
          attempts: oldest.attempts,
          amount: oldest.amount,
          ageMs: Math.max(0, now.getTime() - new Date(oldest.createdAt).getTime()),
          idempotencyKeyTag: tagIdempotencyKey(oldest.idempotencyKey),
        }
      : null,
    latestOperationAt: latest ? new Date(latest.updatedAt).toISOString() : null,
    recentFailures: failures.map((f) => ({
      idempotencyKeyTag: tagIdempotencyKey(f.idempotencyKey) ?? 'unknown',
      attempts: f.attempts,
      amount: f.amount,
      updatedAt: new Date(f.updatedAt).toISOString(),
      errorCategory: categorizeError(f.lastError),
      errorPreview: redactErrorMessage(f.lastError),
    })),
  };
}

// ─── Alert-ready detection (no scheduler / notifications here) ─────────────────

export type RefundAlertKind = 'EXHAUSTED' | 'STALE_FAILED' | 'RECENT_FAILURE';

export interface RefundRecoveryAlert {
  kind: RefundAlertKind;
  /** Stable identifier for deduplication by a future scheduler. */
  dedupKey: string;
  count: number;
  message: string;
}

export interface RefundRecoveryAlertState {
  generatedAt: string;
  alerts: RefundRecoveryAlert[];
}

/** Pure detection of alert candidates from a precomputed overview. */
export function buildRefundRecoveryAlerts(overview: RefundOperationsOverview): RefundRecoveryAlert[] {
  const alerts: RefundRecoveryAlert[] = [];

  if (overview.counts.exhausted > 0) {
    alerts.push({
      kind: 'EXHAUSTED',
      dedupKey: 'fal-refund:exhausted',
      count: overview.counts.exhausted,
      message: `${overview.counts.exhausted} refund operation(s) reached the attempt limit and require operator review`,
    });
  }

  if (overview.counts.staleFailed > 0) {
    alerts.push({
      kind: 'STALE_FAILED',
      dedupKey: 'fal-refund:stale-failed',
      count: overview.counts.staleFailed,
      message: `${overview.counts.staleFailed} failed refund operation(s) older than the stale threshold`,
    });
  }

  const byCategory = new Map<string, number>();
  for (const failure of overview.recentFailures ?? []) {
    if (failure.errorCategory === 'UNKNOWN') continue;
    byCategory.set(failure.errorCategory, (byCategory.get(failure.errorCategory) ?? 0) + 1);
  }
  for (const [category, count] of byCategory) {
    alerts.push({
      kind: 'RECENT_FAILURE',
      dedupKey: `fal-refund:failure:${category.toLowerCase()}`,
      count,
      message: `${count} recent refund failure(s) categorized as ${category}`,
    });
  }

  return alerts;
}

/** Reads the overview and returns deduplicated, alert-ready candidates. */
export async function detectRefundRecoveryAlerts(
  prisma: PrismaClient,
  options: MonitorOptions = {},
): Promise<RefundRecoveryAlertState> {
  const overview = await getRefundOperationsOverview(prisma, options);
  const byKey = new Map<string, RefundRecoveryAlert>();
  for (const alert of buildRefundRecoveryAlerts(overview)) {
    if (!byKey.has(alert.dedupKey)) byKey.set(alert.dedupKey, alert);
  }
  return { generatedAt: overview.generatedAt, alerts: [...byKey.values()] };
}
