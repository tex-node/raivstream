import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@raivstream/database';
import {
  DEFAULT_RECOVERY_LIMIT,
  MAX_RECOVERY_LIMIT,
  RecoveryGuardError,
  assertNotProductionDatabase,
  assertStagingEnvironment,
  executeRecoveryCommand,
  parseRecoveryLimit,
  runRefundRecovery,
  type RecoverySummary,
} from '../refundRecovery';

const STAGING_URL = 'postgresql://user:pass@127.0.0.1:55484/raivstream_vpc2_pg';

function recoveryPrisma(keys: string[], capture?: { take?: number }) {
  return {
    creditOperation: {
      findMany: vi.fn(async (args: { take: number }) => {
        if (capture) capture.take = args.take;
        return keys.slice(0, args.take).map((idempotencyKey) => ({ idempotencyKey }));
      }),
    },
  } as unknown as PrismaClient;
}

describe('parseRecoveryLimit', () => {
  it('defaults to a safe limit when unset or invalid', () => {
    expect(parseRecoveryLimit(undefined)).toBe(DEFAULT_RECOVERY_LIMIT);
    expect(parseRecoveryLimit('')).toBe(DEFAULT_RECOVERY_LIMIT);
    expect(parseRecoveryLimit('abc')).toBe(DEFAULT_RECOVERY_LIMIT);
  });

  it('honors an explicit limit and bounds it to 1..max', () => {
    expect(parseRecoveryLimit('10')).toBe(10);
    expect(parseRecoveryLimit('0')).toBe(1);
    expect(parseRecoveryLimit('-5')).toBe(1);
    expect(parseRecoveryLimit('9999')).toBe(MAX_RECOVERY_LIMIT);
    expect(parseRecoveryLimit('50', 20)).toBe(20);
  });
});

describe('staging-only guard', () => {
  it('fails closed without RAIVSTREAM_ENV', () => {
    expect(() => assertStagingEnvironment({ DATABASE_URL: STAGING_URL })).toThrow(RecoveryGuardError);
  });

  it('rejects a non-staging marker and production NODE_ENV', () => {
    expect(() => assertStagingEnvironment({ RAIVSTREAM_ENV: 'production', DATABASE_URL: STAGING_URL })).toThrow(/not "staging"/);
    expect(() => assertStagingEnvironment({ RAIVSTREAM_ENV: 'staging', NODE_ENV: 'production', DATABASE_URL: STAGING_URL })).toThrow(/NODE_ENV/);
  });

  it('rejects missing DATABASE_URL and production database hosts', () => {
    expect(() => assertStagingEnvironment({ RAIVSTREAM_ENV: 'staging' })).toThrow(/DATABASE_URL/);
    expect(() => assertStagingEnvironment({ RAIVSTREAM_ENV: 'staging', DATABASE_URL: 'postgresql://u:p@172.18.0.2:5432/postgres' })).toThrow(/production database/);
    expect(() => assertStagingEnvironment({ RAIVSTREAM_ENV: 'staging', DATABASE_URL: 'postgresql://u:p@db.raivstream.com:5432/postgres' })).toThrow(/production database/);
  });

  it('accepts an explicit staging config against the isolated staging host', () => {
    expect(() => assertStagingEnvironment({ RAIVSTREAM_ENV: 'staging', DATABASE_URL: STAGING_URL })).not.toThrow();
  });

  it('rejects an invalid DATABASE_URL', () => {
    expect(() => assertNotProductionDatabase('not-a-url')).toThrow(/valid URL/);
  });
});

describe('runRefundRecovery', () => {
  it('returns a concise summary and passes the bounded limit to the query', async () => {
    const capture: { take?: number } = {};
    const prisma = recoveryPrisma(['op-a', 'op-b', 'op-c'], capture);
    const executeRefund = vi
      .fn()
      .mockResolvedValueOnce({ executed: true, reason: 'COMPLETED' })
      .mockResolvedValueOnce({ executed: false, reason: 'FAILED' })
      .mockResolvedValueOnce({ executed: false, reason: 'NOT_CLAIMABLE' });

    const summary = await runRefundRecovery(prisma, 3, { executeRefund });

    expect(summary).toEqual<RecoverySummary>({ found: 3, completed: 1, skipped: 1, failed: 1 });
    expect(capture.take).toBe(3);
    expect(executeRefund).toHaveBeenCalledTimes(3);
  });

  it('reports zero work when no retryable operations exist', async () => {
    const prisma = recoveryPrisma([]);
    const summary = await runRefundRecovery(prisma, DEFAULT_RECOVERY_LIMIT, { executeRefund: vi.fn() });
    expect(summary).toEqual({ found: 0, completed: 0, skipped: 0, failed: 0 });
  });
});

describe('executeRecoveryCommand', () => {
  const prisma = {} as unknown as PrismaClient;

  it('refuses (exit 2) when the staging guard fails', async () => {
    const log = vi.fn();
    const code = await executeRecoveryCommand({ prisma, env: { DATABASE_URL: STAGING_URL }, log });
    expect(code).toBe(2);
    expect(log.mock.calls[0][0]).toMatch(/refused/);
  });

  it('prints the summary and returns 0 on success (default limit)', async () => {
    const log = vi.fn();
    const runRecovery = vi.fn(async (_p: PrismaClient, limit: number) => {
      expect(limit).toBe(DEFAULT_RECOVERY_LIMIT);
      return { found: 2, completed: 2, skipped: 0, failed: 0 };
    });
    const code = await executeRecoveryCommand({
      prisma,
      env: { RAIVSTREAM_ENV: 'staging', DATABASE_URL: STAGING_URL },
      runRecovery,
      log,
    });
    expect(code).toBe(0);
    expect(runRecovery).toHaveBeenCalledWith(prisma, DEFAULT_RECOVERY_LIMIT);
    expect(log.mock.calls[0][0]).toContain('found=2 completed=2 skipped=0 failed=0');
  });

  it('passes an explicit bounded limit through', async () => {
    const runRecovery = vi.fn(async () => ({ found: 0, completed: 0, skipped: 0, failed: 0 }));
    await executeRecoveryCommand({
      prisma,
      env: { RAIVSTREAM_ENV: 'staging', DATABASE_URL: STAGING_URL },
      limitRaw: '500',
      runRecovery,
      log: vi.fn(),
    });
    expect(runRecovery).toHaveBeenCalledWith(prisma, MAX_RECOVERY_LIMIT);
  });

  it('returns 1 on an unrecoverable runtime error', async () => {
    const log = vi.fn();
    const code = await executeRecoveryCommand({
      prisma,
      env: { RAIVSTREAM_ENV: 'staging', DATABASE_URL: STAGING_URL },
      runRecovery: vi.fn(async () => {
        throw new Error('db down');
      }),
      log,
    });
    expect(code).toBe(1);
    expect(log.mock.calls[0][0]).toMatch(/unrecoverable/);
  });
});
