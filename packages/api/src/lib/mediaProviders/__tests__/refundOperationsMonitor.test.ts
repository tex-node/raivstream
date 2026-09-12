import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@raivstream/database';
import {
  DEFAULT_STALE_THRESHOLD_MS,
  MAX_RECENT_FAILURES,
  buildRefundRecoveryAlerts,
  categorizeError,
  detectRefundRecoveryAlerts,
  getRefundOperationsOverview,
  redactErrorMessage,
  tagIdempotencyKey,
} from '../refundOperationsMonitor';
import { executeRecoveryCommand } from '../refundRecovery';

type Op = {
  idempotencyKey: string;
  status: string;
  attempts: number;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
  lastError: string | null;
};

const NOW = new Date('2026-09-12T12:00:00.000Z');
const min = (n: number) => new Date(NOW.getTime() - n * 60_000);
const hours = (n: number) => new Date(NOW.getTime() - n * 60 * 60_000);

const OPS: Op[] = [
  { idempotencyKey: 'fal-refund:job-a', status: 'PENDING', attempts: 0, amount: 5, createdAt: min(10), updatedAt: min(10), lastError: null },
  { idempotencyKey: 'fal-refund:job-b', status: 'FAILED', attempts: 2, amount: 7, createdAt: hours(2), updatedAt: min(90), lastError: 'connection refused to postgresql://u:p@127.0.0.1:55484/db' },
  { idempotencyKey: 'fal-refund:job-c', status: 'FAILED', attempts: 5, amount: 11, createdAt: hours(30), updatedAt: hours(26), lastError: 'request timed out' },
  { idempotencyKey: 'fal-refund:job-d', status: 'COMPLETED', attempts: 1, amount: 3, createdAt: hours(5), updatedAt: hours(5), lastError: null },
];

function matches(op: Op, where: any): boolean {
  if (!where) return true;
  if (typeof where.status === 'string' && op.status !== where.status) return false;
  if (where.status && typeof where.status === 'object' && Array.isArray(where.status.in) && !where.status.in.includes(op.status)) return false;
  if (where.attempts) {
    if (where.attempts.lt !== undefined && !(op.attempts < where.attempts.lt)) return false;
    if (where.attempts.gte !== undefined && !(op.attempts >= where.attempts.gte)) return false;
  }
  if (where.updatedAt?.lt && !(op.updatedAt < where.updatedAt.lt)) return false;
  return true;
}

function makePrisma(ops: Op[]) {
  const findManySpy = vi.fn();
  const prisma = {
    creditOperation: {
      count: async ({ where }: any) => ops.filter((o) => matches(o, where)).length,
      aggregate: async ({ where }: any) => {
        const sum = ops.filter((o) => matches(o, where)).reduce((s, o) => s + o.amount, 0);
        return { _sum: { amount: sum === 0 ? null : sum } };
      },
      findFirst: async ({ where, orderBy }: any) => {
        const list = ops.filter((o) => matches(o, where));
        if (list.length === 0) return null;
        const sorted = [...list].sort((a, b) =>
          orderBy?.createdAt === 'asc' ? a.createdAt.getTime() - b.createdAt.getTime() : b.updatedAt.getTime() - a.updatedAt.getTime(),
        );
        return sorted[0];
      },
      findMany: async (args: any) => {
        findManySpy(args);
        const list = ops.filter((o) => matches(o, args.where));
        list.sort((a, b) => (args.orderBy?.updatedAt === 'desc' ? b.updatedAt.getTime() - a.updatedAt.getTime() : 0));
        return list.slice(0, args.take ?? list.length);
      },
    },
  } as unknown as PrismaClient;
  return { prisma, findManySpy };
}

describe('redaction + categorization', () => {
  it('redacts connection strings, URLs, emails, and long tokens', () => {
    const out = redactErrorMessage('failed postgresql://u:p@127.0.0.1:55484/db email a@b.com token abcdefghijklmnopqrstuvwxyz012345');
    expect(out).not.toContain('127.0.0.1');
    expect(out).not.toContain('a@b.com');
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz012345');
    expect(out).toContain('<redacted>');
  });

  it('returns null for empty errors and truncates long ones', () => {
    expect(redactErrorMessage(null)).toBeNull();
    expect(redactErrorMessage('   ')).toBeNull();
    expect((redactErrorMessage('x'.repeat(500)) ?? '').length).toBeLessThanOrEqual(200);
  });

  it('categorizes errors coarsely', () => {
    expect(categorizeError('request timed out')).toBe('TIMEOUT');
    expect(categorizeError('ECONNREFUSED')).toBe('CONNECTION');
    expect(categorizeError('unique constraint violated')).toBe('CONSTRAINT');
    expect(categorizeError('r2 putObject failed')).toBe('STORAGE');
    expect(categorizeError('provider http 500')).toBe('PROVIDER');
    expect(categorizeError(null)).toBe('UNKNOWN');
  });

  it('produces a stable non-reversible key tag', () => {
    const tag = tagIdempotencyKey('fal-refund:job-a');
    expect(tag).toMatch(/^fal-refund#[0-9a-f]{8}$/);
    expect(tag).toBe(tagIdempotencyKey('fal-refund:job-a'));
    expect(tag).not.toContain('job-a');
  });
});

describe('getRefundOperationsOverview', () => {
  it('computes recoverable, exhausted, stale, completed counts and amounts', async () => {
    const { prisma } = makePrisma(OPS);
    const o = await getRefundOperationsOverview(prisma, { now: NOW, staleThresholdMs: DEFAULT_STALE_THRESHOLD_MS, maxAttempts: 5 });

    expect(o.counts).toMatchObject({ pending: 1, failed: 2, completed: 1, recoverable: 2, exhausted: 1, staleFailed: 1, total: 4 });
    expect(o.amounts).toEqual({ awaitingRecovery: 12, exhausted: 11 });
    // Completed (job-d, amount 3) is excluded from awaitingRecovery (12 = 5 + 7).
  });

  it('reports the oldest unresolved operation and latest update', async () => {
    const { prisma } = makePrisma(OPS);
    const o = await getRefundOperationsOverview(prisma, { now: NOW, maxAttempts: 5 });
    expect(o.oldestUnresolved).toMatchObject({ status: 'FAILED', attempts: 5, amount: 11 });
    expect(o.oldestUnresolved?.ageMs).toBe(30 * 60 * 60_000);
    expect(o.latestOperationAt).toBe(min(10).toISOString());
    expect(o.oldestUnresolved?.idempotencyKeyTag).toMatch(/^fal-refund#/);
  });

  it('returns redacted, categorized recent failures ordered by recency', async () => {
    const { prisma } = makePrisma(OPS);
    const o = await getRefundOperationsOverview(prisma, { now: NOW, maxAttempts: 5 });
    expect(o.recentFailures).toHaveLength(2);
    expect(o.recentFailures[0]).toMatchObject({ errorCategory: 'CONNECTION', attempts: 2, amount: 7 });
    expect(o.recentFailures[0].errorPreview).not.toContain('127.0.0.1');
    expect(o.recentFailures[1]).toMatchObject({ errorCategory: 'TIMEOUT' });
  });

  it('bounds the recent-failures query', async () => {
    const { prisma, findManySpy } = makePrisma(OPS);
    await getRefundOperationsOverview(prisma, { now: NOW, recentFailuresLimit: 1 });
    expect(findManySpy.mock.calls[0][0].take).toBe(1);
    await getRefundOperationsOverview(prisma, { now: NOW, recentFailuresLimit: 9999 });
    expect(findManySpy.mock.calls[1][0].take).toBe(MAX_RECENT_FAILURES);
  });

  it('handles an empty outbox', async () => {
    const { prisma } = makePrisma([]);
    const o = await getRefundOperationsOverview(prisma, { now: NOW });
    expect(o.counts).toEqual({ pending: 0, failed: 0, completed: 0, recoverable: 0, exhausted: 0, staleFailed: 0, total: 0 });
    expect(o.amounts).toEqual({ awaitingRecovery: 0, exhausted: 0 });
    expect(o.oldestUnresolved).toBeNull();
    expect(o.latestOperationAt).toBeNull();
  });
});

describe('alert-ready detection', () => {
  it('produces deduplicated candidates with severities for exhausted and stale', async () => {
    const { prisma } = makePrisma(OPS);
    const state = await detectRefundRecoveryAlerts(prisma, { now: NOW, maxAttempts: 5 });
    const keys = state.alerts.map((a) => a.dedupKey);
    expect(new Set(keys).size).toBe(keys.length); // deduplicated
    expect(state.alerts.find((a) => a.dedupKey === 'fal-refund:exhausted')?.severity).toBe('CRITICAL');
    expect(state.alerts.find((a) => a.dedupKey === 'fal-refund:stale-failed')?.severity).toBe('WARNING');
    // Only one failure per category in OPS → below the repeated-failure threshold.
    expect(keys).not.toContain('fal-refund:failure:connection');
    expect(keys).not.toContain('fal-refund:failure:timeout');
  });

  it('suppresses repeated-failure alerts below the threshold and escalates at/above it', async () => {
    const repeated = (n: number, error: string) =>
      Array.from({ length: n }, (_, i) => ({
        idempotencyKey: `fal-refund:rep-${i}`,
        status: 'FAILED',
        attempts: 1,
        amount: 1,
        createdAt: hours(1),
        updatedAt: min(30),
        lastError: error,
      }));

    const two = await detectRefundRecoveryAlerts(makePrisma(repeated(2, 'ECONNREFUSED')).prisma, { now: NOW, maxAttempts: 5 });
    expect(two.alerts.some((a) => a.kind === 'RECENT_FAILURE')).toBe(false);

    const three = await detectRefundRecoveryAlerts(makePrisma(repeated(3, 'ECONNREFUSED')).prisma, { now: NOW, maxAttempts: 5 });
    expect(three.alerts.find((a) => a.dedupKey === 'fal-refund:failure:connection')?.severity).toBe('WARNING');

    const ten = await detectRefundRecoveryAlerts(makePrisma(repeated(10, 'request timed out')).prisma, { now: NOW, maxAttempts: 5 });
    expect(ten.alerts.find((a) => a.dedupKey === 'fal-refund:failure:timeout')?.severity).toBe('CRITICAL');
  });

  it('returns no alerts for a clean outbox', () => {
    const overview = {
      counts: { pending: 0, failed: 0, completed: 1, recoverable: 0, exhausted: 0, staleFailed: 0, total: 1 },
      recentFailures: [],
    } as any;
    expect(buildRefundRecoveryAlerts(overview)).toEqual([]);
  });
});

describe('recovery command output compatibility', () => {
  const env = { RAIVSTREAM_ENV: 'staging', DATABASE_URL: 'postgresql://u:p@127.0.0.1:55484/raivstream_vpc2_pg' };
  const prisma = {} as unknown as PrismaClient;

  it('keeps the summary line and appends exhausted/remaining when available', async () => {
    const log = vi.fn();
    const code = await executeRecoveryCommand({
      prisma,
      env,
      log,
      runRecovery: vi.fn(async () => ({ found: 1, completed: 1, skipped: 0, failed: 0 })),
      getOverview: vi.fn(async () => ({ exhausted: 2, recoverable: 3 })),
    });
    expect(code).toBe(0);
    expect(log.mock.calls[0][0]).toContain('found=1 completed=1 skipped=0 failed=0');
    expect(log.mock.calls[1][0]).toContain('exhausted=2 remaining=3');
    expect(log.mock.calls[2][0]).toContain('WARNING');
  });

  it('stays backward-compatible when the overview is unavailable', async () => {
    const log = vi.fn();
    const code = await executeRecoveryCommand({
      prisma,
      env,
      log,
      runRecovery: vi.fn(async () => ({ found: 0, completed: 0, skipped: 0, failed: 0 })),
      getOverview: vi.fn(async () => {
        throw new Error('overview unavailable');
      }),
    });
    expect(code).toBe(0);
    expect(log.mock.calls[0][0]).toContain('found=0 completed=0 skipped=0 failed=0');
    expect(log).toHaveBeenCalledTimes(1);
  });
});
