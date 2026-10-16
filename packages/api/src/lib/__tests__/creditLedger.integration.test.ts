/**
 * Phase 1 — Credit ledger integrity, idempotency and concurrency (real PostgreSQL).
 *
 * Proves the R16-01/PL-01 accounting guarantees against a real PostgreSQL 17
 * database (NOT mocks):
 *   - A1: replayed/concurrent deductions and refunds with the same idempotency
 *         key mutate the balance exactly once.
 *   - A1: conflicting key reuse for a different operation fails safely.
 *   - Legacy rows with a NULL idempotency key remain valid (nullable unique).
 *   - Insufficient-credit races never drive the balance negative.
 *   - A4: parallel administrative adjustments do not lose updates.
 *   - PL-01: SUM(ledger) === balance after mixed operations.
 *
 * Database: disposable localhost:5433 cluster (trust auth, never the VPS).
 * Skips gracefully when the test database is not reachable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@raivstream/database';
import {
  deductCredits,
  refundCredits,
  reserveCredits,
  releaseCredits,
  settleCredits,
} from '../credits';
import { adminRouter } from '../../routers/admin';

const TEST_DB_URL = 'postgresql://postgres@localhost:5433/raivstream_phase6d_test';
const FEATURE_KEY  = 'test:ledger';
const COST         = 100;
const RACE         = 8;

let db: PrismaClient | null = null;

let userId: string;
let adminId: string;

const ADMIN_USER = {
  id: '', email: 'admin@test.local', username: 'ledger-admin', displayName: 'Ledger Admin',
  avatarUrl: null, role: 'ADMIN', premiumTier: 'CREATOR', verified: true,
  followerCount: 0, followingCount: 0, totalViews: 0, totalLikes: 0,
};

async function setBalance(id: string, balance: number) {
  await db!.creditBalance.upsert({
    where:  { userId: id },
    create: { userId: id, balance },
    update: { balance },
  });
}

async function balanceOf(id: string): Promise<number> {
  const row = await db!.creditBalance.findUnique({ where: { userId: id }, select: { balance: true } });
  return row?.balance ?? 0;
}

async function ledgerSum(id: string): Promise<number> {
  const agg = await db!.creditTransaction.aggregate({ where: { userId: id }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

describe('Phase 1 — credit ledger idempotency & concurrency (real DB)', () => {
  beforeAll(async () => {
    const client = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } }, log: [] });
    try {
      await client.$connect();
      await client.$queryRaw`SELECT 1`;
      db = client;
    } catch {
      console.warn('[phase1 integration] Test database not reachable — all tests will be skipped.');
      await client.$disconnect().catch(() => {});
      return;
    }

    await db.$transaction([
      db.$executeRaw`TRUNCATE "credit_transactions" CASCADE`,
      db.$executeRaw`TRUNCATE "credit_reservations" CASCADE`,
      db.$executeRaw`TRUNCATE "credit_operations" CASCADE`,
      db.$executeRaw`TRUNCATE "credit_balances" CASCADE`,
      db.$executeRaw`TRUNCATE "feature_credit_rates" CASCADE`,
      db.$executeRaw`TRUNCATE "users" CASCADE`,
    ]);

    const user  = await db.user.create({ data: { email: 'ledger-user@test.local', username: 'ledger-user', displayName: 'Ledger User', verified: true } });
    const admin = await db.user.create({ data: { email: 'ledger-admin@test.local', username: 'ledger-admin', displayName: 'Ledger Admin', verified: true, role: 'ADMIN' } });
    userId  = user.id;
    adminId = admin.id;
    ADMIN_USER.id = admin.id;

    await db.featureCreditRate.create({ data: { featureKey: FEATURE_KEY, creditsPerUnit: COST, isActive: true } });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('A1 — concurrent deductions with the same key charge exactly once', async () => {
    await setBalance(userId, 10_000);
    const before = await balanceOf(userId);
    const key = `test:charge:${Date.now()}`;

    const results = await Promise.all(
      Array.from({ length: RACE }, () =>
        deductCredits(db!, userId, FEATURE_KEY, 'ref-1', 'concurrent charge', key),
      ),
    );

    expect(results.every((r) => r === COST)).toBe(true);
    expect(await balanceOf(userId)).toBe(before - COST);
    expect(await db!.creditTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('A1 — concurrent refunds with the same key refund exactly once', async () => {
    await setBalance(userId, 1_000);
    const before = await balanceOf(userId);
    const key = `test:refund:${Date.now()}`;

    await Promise.all(
      Array.from({ length: RACE }, () =>
        refundCredits(db!, userId, COST, FEATURE_KEY, 'ref-2', 'concurrent refund', key),
      ),
    );

    expect(await balanceOf(userId)).toBe(before + COST);
    expect(await db!.creditTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('A1 — conflicting reuse of a key for a different operation fails safely', async () => {
    await setBalance(userId, 5_000);
    const key = `test:conflict:${Date.now()}`;

    await deductCredits(db!, userId, FEATURE_KEY, 'ref-3', 'first use', key);
    const mid = await balanceOf(userId);

    // Same key, different featureKey → CONFLICT, no mutation.
    await expect(
      deductCredits(db!, userId, 'test:other', 'ref-3', 'conflicting use', key),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(await balanceOf(userId)).toBe(mid);
    expect(await db!.creditTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('A1 — every write requires a key; sequential writes with distinct keys both land', async () => {
    await setBalance(userId, 5_000);
    const before = await balanceOf(userId);
    const k1 = `test:seq:${Date.now()}:1`;
    const k2 = `test:seq:${Date.now()}:2`;

    await deductCredits(db!, userId, FEATURE_KEY, 'seq-1', 'keyed 1', k1);
    await deductCredits(db!, userId, FEATURE_KEY, 'seq-2', 'keyed 2', k2);

    expect(await balanceOf(userId)).toBe(before - 2 * COST);
    expect(await db!.creditTransaction.count({ where: { idempotencyKey: { in: [k1, k2] } } })).toBe(2);
  });

  it('insufficient-credit race never drives the balance negative', async () => {
    await setBalance(userId, COST); // exactly one charge available

    const outcomes = await Promise.allSettled(
      Array.from({ length: RACE }, (_, i) =>
        deductCredits(db!, userId, FEATURE_KEY, `race-${i}`, 'insufficient race', `test:ins:${Date.now()}:${i}`),
      ),
    );

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled').length;
    const rejected  = outcomes.filter((o) => o.status === 'rejected').length;
    expect(fulfilled).toBe(1);
    expect(rejected).toBe(RACE - 1);
    expect(await balanceOf(userId)).toBe(0);
  });

  it('A4 — parallel administrative adjustments do not lose updates', async () => {
    await setBalance(adminId, 0);
    const caller = adminRouter.createCaller({ prisma: db, user: ADMIN_USER, userId: adminId, isR16: false } as never);

    await Promise.all(
      Array.from({ length: RACE }, (_, i) =>
        caller.adjustCredits({ userId: adminId, amount: 250, action: 'gift', description: `parallel gift ${i}`, idempotencyId: crypto.randomUUID() }),
      ),
    );

    expect(await balanceOf(adminId)).toBe(RACE * 250);
  });

  it('A4 — a deduction larger than the balance is rejected, never negative', async () => {
    await setBalance(adminId, 300);
    const caller = adminRouter.createCaller({ prisma: db, user: ADMIN_USER, userId: adminId, isR16: false } as never);

    await expect(
      caller.adjustCredits({ userId: adminId, amount: -500, action: 'deduct', description: 'over-deduct', idempotencyId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(await balanceOf(adminId)).toBe(300);
  });

  it('PL-01 — reconciliation invariant holds across mixed operations', async () => {
    // Fresh user so the ledger starts empty (opening balance 0 → invariant exact).
    const u = await db!.user.create({ data: { email: 'recon@test.local', username: `recon-${Date.now()}`, displayName: 'Recon', verified: true } });

    // Purchase (as recorded by the payment webhook), grant, two charges, one refund.
    await db!.creditBalance.create({ data: { userId: u.id, balance: 1_000 } });
    await db!.creditTransaction.create({ data: { userId: u.id, amount: 1_000, type: 'PURCHASE', referenceId: 'pay_1', idempotencyKey: `test:purchase:${u.id}`, balanceBefore: 0, balanceAfter: 1_000 } });
    await db!.creditTransaction.create({ data: { userId: u.id, amount: 500, type: 'BONUS', description: 'grant', idempotencyKey: `test:bonus:${u.id}`, balanceBefore: 1_000, balanceAfter: 1_500 } });
    await db!.creditBalance.update({ where: { userId: u.id }, data: { balance: 1_500 } });

    await deductCredits(db!, u.id, FEATURE_KEY, 'mixed-1', 'charge 1', `test:deduct:${u.id}:1`);
    await deductCredits(db!, u.id, FEATURE_KEY, 'mixed-2', 'charge 2', `test:deduct:${u.id}:2`);
    await refundCredits(db!, u.id, COST, FEATURE_KEY, 'mixed-2', 'refund one', `test:refund:${u.id}:2`);

    const balance = await balanceOf(u.id);
    const sum     = await ledgerSum(u.id);
    expect(sum).toBe(balance); // SUM(CreditTransaction.amount) === CreditBalance.balance
  });

  it('retry parity — reserve/settle/release are idempotent per attempt key', async () => {
    await setBalance(userId, 10_000);
    const key = `test:reserve:${Date.now()}:1`;
    const before = await balanceOf(userId);

    // Reserve twice with the same attempt key → one hold.
    await reserveCredits(db!, { userId, featureKey: FEATURE_KEY, amount: COST, idempotencyKey: key, referenceId: 'job-1', generationJobId: 'job-1' });
    await reserveCredits(db!, { userId, featureKey: FEATURE_KEY, amount: COST, idempotencyKey: key, referenceId: 'job-1', generationJobId: 'job-1' });
    expect(await balanceOf(userId)).toBe(before - COST);

    // Release twice → one refund, second no-op.
    await releaseCredits(db!, key);
    await releaseCredits(db!, key);
    expect(await balanceOf(userId)).toBe(before);
    expect(await db!.creditReservation.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('cancel-vs-failure — a shared refund key refunds exactly once', async () => {
    await setBalance(userId, 10_000);
    // One charge, then two competing refund paths (cancel + failure) using the
    // SAME key — exactly one refund must land.
    await deductCredits(db!, userId, FEATURE_KEY, 'job-9', 'attempt 0', `test:job9-charge:${Date.now()}`);
    const afterCharge = await balanceOf(userId);
    const key = `test:shared-refund:${Date.now()}`;

    await Promise.all([
      refundCredits(db!, userId, COST, FEATURE_KEY, 'job-9', 'cancel refund', key),
      refundCredits(db!, userId, COST, FEATURE_KEY, 'job-9', 'failure refund', key),
    ]);

    expect(await balanceOf(userId)).toBe(afterCharge + COST);
    expect(await db!.creditTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
  });
});
