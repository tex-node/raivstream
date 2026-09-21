import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@raivstream/database';
import { reserveCredits, settleCredits, releaseCredits, releaseStuckReservations, isReserveSettleEnabled } from '../credits';

type Reservation = {
  id: string;
  idempotencyKey: string;
  status: string;
  userId: string;
  generationJobId: string | null;
  featureKey: string | null;
  amount: number;
  settledAmount: number | null;
  referenceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  settledAt: Date | null;
  releasedAt: Date | null;
};

function makeMockPrisma(seed?: { balances?: Record<string, number>; reservations?: Reservation[] }) {
  const state = {
    balances: { ...(seed?.balances ?? {}) } as Record<string, number>,
    reservations: [...(seed?.reservations ?? [])] as Reservation[],
    transactions: [] as Record<string, unknown>[],
    counter: 0,
  };

  const prisma: Record<string, unknown> = {
    creditReservation: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        state.reservations.find((r) => r.idempotencyKey === where.idempotencyKey) ?? null,
      findMany: async ({ where, take }: { where: { status: string; createdAt?: { lt: Date } }; take?: number }) =>
        state.reservations
          .filter((r) => r.status === where.status && (!where.createdAt?.lt || r.createdAt < where.createdAt.lt))
          .slice(0, take ?? 100),
      create: async ({ data }: { data: Partial<Reservation> }) => {
        if (state.reservations.some((r) => r.idempotencyKey === data.idempotencyKey)) {
          const err = new Error('unique constraint') as Error & { code?: string };
          err.code = 'P2002';
          throw err;
        }
        const r = Object.assign(
          {
            id: `res${++state.counter}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            settledAmount: null,
            settledAt: null,
            releasedAt: null,
            generationJobId: null,
            referenceId: null,
          },
          data,
        ) as Reservation;
        state.reservations.push(r);
        return r;
      },
      update: async ({ where, data }: { where: { idempotencyKey: string }; data: Partial<Reservation> }) => {
        const r = state.reservations.find((x) => x.idempotencyKey === where.idempotencyKey);
        if (!r) throw new Error('reservation not found');
        Object.assign(r, data);
        return r;
      },
    },
    creditBalance: {
      updateMany: async ({ where, data }: { where: { userId: string; balance: { gte: number } }; data: { balance: { decrement: number } } }) => {
        const bal = state.balances[where.userId] ?? 0;
        if (bal >= where.balance.gte) {
          state.balances[where.userId] = bal - data.balance.decrement;
          return { count: 1 };
        }
        return { count: 0 };
      },
      findUnique: async ({ where }: { where: { userId: string } }) => ({
        userId: where.userId,
        balance: state.balances[where.userId] ?? 0,
      }),
      upsert: async ({ where, create, update }: { where: { userId: string }; create: { balance: number }; update: { balance: { increment: number } } }) => {
        if (state.balances[where.userId] === undefined) state.balances[where.userId] = create.balance;
        else state.balances[where.userId] += update.balance.increment;
        return { userId: where.userId, balance: state.balances[where.userId] };
      },
    },
    creditTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.transactions.push({ ...data });
        return data;
      },
    },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(state);
      try {
        return await cb(prisma);
      } catch (err) {
        Object.assign(state, snapshot);
        throw err;
      }
    },
  };

  return { prisma: prisma as unknown as PrismaClient, state };
}

const reserve = (amount = 80) => ({
  userId: 'user1',
  featureKey: 'generate:flux2',
  amount,
  idempotencyKey: 'reserve:job1',
  referenceId: 'job1',
  generationJobId: 'job1',
});

describe('credit reserve/settle/release (flag-guarded)', () => {
  it('is off unless CREDIT_RESERVE_SETTLE_ENABLED=true', () => {
    expect(isReserveSettleEnabled({})).toBe(false);
    expect(isReserveSettleEnabled({ CREDIT_RESERVE_SETTLE_ENABLED: 'true' })).toBe(true);
    expect(isReserveSettleEnabled({ CREDIT_RESERVE_SETTLE_ENABLED: '1' })).toBe(false);
  });

  it('reserves atomically: decrements balance, records HELD + USAGE', async () => {
    const { prisma, state } = makeMockPrisma({ balances: { user1: 100 } });
    const amount = await reserveCredits(prisma, reserve());
    expect(amount).toBe(80);
    expect(state.balances.user1).toBe(20);
    expect(state.reservations[0]).toMatchObject({ status: 'HELD', amount: 80 });
    expect(state.transactions[0]).toMatchObject({ type: 'USAGE', amount: -80 });
  });

  it('is idempotent — same key never double-charges', async () => {
    const { prisma, state } = makeMockPrisma({ balances: { user1: 100 } });
    await reserveCredits(prisma, reserve());
    await reserveCredits(prisma, reserve());
    expect(state.balances.user1).toBe(20);
    expect(state.reservations).toHaveLength(1);
    expect(state.transactions).toHaveLength(1);
  });

  it('throws PAYMENT_REQUIRED on insufficient balance', async () => {
    const { prisma, state } = makeMockPrisma({ balances: { user1: 10 } });
    await expect(reserveCredits(prisma, reserve())).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED' });
    expect(state.balances.user1).toBe(10);
    expect(state.reservations).toHaveLength(0);
  });

  it('settles an overage by refunding the delta', async () => {
    const { prisma, state } = makeMockPrisma({ balances: { user1: 100 } });
    await reserveCredits(prisma, reserve(80));
    const res = await settleCredits(prisma, 'reserve:job1', 50);
    expect(res).toEqual({ settled: true, delta: 30 });
    expect(state.balances.user1).toBe(50);
    expect(state.reservations[0]).toMatchObject({ status: 'SETTLED', settledAmount: 50 });
    expect(state.transactions[1]).toMatchObject({ type: 'REFUND', amount: 30 });
  });

  it('settles an exact match with no balance change', async () => {
    const { prisma, state } = makeMockPrisma({ balances: { user1: 100 } });
    await reserveCredits(prisma, reserve(80));
    const res = await settleCredits(prisma, 'reserve:job1', 80);
    expect(res).toEqual({ settled: true, delta: 0 });
    expect(state.balances.user1).toBe(20);
    expect(state.transactions).toHaveLength(1); // only the reserve USAGE
  });

  it('settles an underage by charging the delta', async () => {
    const { prisma, state } = makeMockPrisma({ balances: { user1: 100 } });
    await reserveCredits(prisma, reserve(80));
    const res = await settleCredits(prisma, 'reserve:job1', 100);
    expect(res).toEqual({ settled: true, delta: -20 });
    expect(state.balances.user1).toBe(0);
    expect(state.transactions[1]).toMatchObject({ type: 'USAGE', amount: -20 });
  });

  it('settle is a no-op on a non-HELD reservation', async () => {
    const { prisma, state } = makeMockPrisma({ balances: { user1: 100 } });
    await reserveCredits(prisma, reserve(80));
    await settleCredits(prisma, 'reserve:job1', 80);
    const second = await settleCredits(prisma, 'reserve:job1', 10);
    expect(second).toEqual({ settled: false, delta: 0 });
    expect(state.balances.user1).toBe(20);
  });

  it('releases a HELD reservation, refunding the full amount', async () => {
    const { prisma, state } = makeMockPrisma({ balances: { user1: 100 } });
    await reserveCredits(prisma, reserve(80));
    const res = await releaseCredits(prisma, 'reserve:job1');
    expect(res).toEqual({ released: true });
    expect(state.balances.user1).toBe(100);
    expect(state.reservations[0].status).toBe('RELEASED');
    expect(state.transactions[1]).toMatchObject({ type: 'REFUND', amount: 80 });
  });

  it('release is a no-op on a non-HELD reservation (no double-refund)', async () => {
    const { prisma, state } = makeMockPrisma({ balances: { user1: 100 } });
    await reserveCredits(prisma, reserve(80));
    await releaseCredits(prisma, 'reserve:job1');
    const second = await releaseCredits(prisma, 'reserve:job1');
    expect(second).toEqual({ released: false });
    expect(state.balances.user1).toBe(100);
  });

  it('releases only stuck HELD reservations older than the cutoff', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const base = {
      userId: 'user1', generationJobId: null, featureKey: 'generate:flux2', settledAmount: null,
      referenceId: null, updatedAt: new Date(), settledAt: null, releasedAt: null,
    };
    const { prisma, state } = makeMockPrisma({
      balances: { user1: 0 },
      reservations: [
        { id: 'r1', idempotencyKey: 'reserve:job1', status: 'HELD', amount: 80, createdAt: old, ...base },
        { id: 'r2', idempotencyKey: 'reserve:job2', status: 'HELD', amount: 50, createdAt: new Date(), ...base },
      ],
    });

    const result = await releaseStuckReservations(prisma, 24 * 60 * 60 * 1000);

    expect(result).toEqual({ scanned: 1, released: 1 });
    expect(state.balances.user1).toBe(80);
    expect(state.reservations.find((r) => r.idempotencyKey === 'reserve:job1')!.status).toBe('RELEASED');
    expect(state.reservations.find((r) => r.idempotencyKey === 'reserve:job2')!.status).toBe('HELD');
  });
});
