import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@raivstream/database';
import {
  falProviderJobKey,
  falRefundIdempotencyKey,
  processProviderWebhook,
  retryPendingRefundOperations,
} from '../webhookProcessing';

type Job = { id: string; userId: string; creditsUsed: number; status: string; providerJobId: string; outputUrl: string | null };
type Op = {
  id: string;
  idempotencyKey: string;
  status: string;
  userId: string;
  generationJobId: string | null;
  featureKey: string | null;
  amount: number;
  referenceId: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
};

function makeMockPrisma(seed: { job?: Job; ops?: Op[]; balances?: Record<string, number> } = {}) {
  const ctx: {
    state: { jobs: Job[]; ops: Op[]; balances: Record<string, number>; transactions: Array<Record<string, unknown>>; opCounter: number };
    failBalanceUpsertOnce: boolean;
  } = {
    state: {
      jobs: seed.job ? [{ ...seed.job }] : [],
      ops: (seed.ops ?? []).map((o) => ({ ...o })),
      balances: { ...(seed.balances ?? {}) },
      transactions: [],
      opCounter: 0,
    },
    failBalanceUpsertOnce: false,
  };

  const prisma: Record<string, unknown> = {
    generationJob: {
      findFirst: async ({ where }: { where: { providerJobId: string } }) =>
        ctx.state.jobs.find((j) => j.providerJobId === where.providerJobId) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; status: { in: string[] } }; data: Record<string, unknown> }) => {
        let count = 0;
        for (const j of ctx.state.jobs) {
          if (j.id === where.id && where.status.in.includes(j.status)) {
            Object.assign(j, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    creditOperation: {
      upsert: async ({ where, create }: { where: { idempotencyKey: string }; create: Partial<Op> }) => {
        const existing = ctx.state.ops.find((o) => o.idempotencyKey === where.idempotencyKey);
        if (existing) return existing;
        const op = { id: `op${++ctx.state.opCounter}`, attempts: 0, lastError: null, createdAt: new Date(), status: 'PENDING', ...create } as Op;
        ctx.state.ops.push(op);
        return op;
      },
      updateMany: async ({ where, data }: { where: { idempotencyKey: string; status: { in: string[] } }; data: { status: string; attempts?: { increment: number } } }) => {
        let count = 0;
        for (const o of ctx.state.ops) {
          if (o.idempotencyKey === where.idempotencyKey && where.status.in.includes(o.status)) {
            o.status = data.status;
            if (data.attempts?.increment) o.attempts += data.attempts.increment;
            count += 1;
          }
        }
        return { count };
      },
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        ctx.state.ops.find((o) => o.idempotencyKey === where.idempotencyKey) ?? null,
      findMany: async ({ where }: { where: { status: { in: string[] }; attempts: { lt: number } } }) =>
        ctx.state.ops.filter((o) => where.status.in.includes(o.status) && o.attempts < where.attempts.lt),
      update: async ({ where, data }: { where: { id?: string; idempotencyKey?: string }; data: Record<string, unknown> }) => {
        const o = ctx.state.ops.find((x) => (where.id ? x.id === where.id : x.idempotencyKey === where.idempotencyKey));
        if (!o) throw new Error('operation not found');
        Object.assign(o, data);
        return o;
      },
    },
    creditBalance: {
      upsert: async ({ where, create, update }: { where: { userId: string }; create: { balance: number }; update: { balance: { increment: number } } }) => {
        if (ctx.failBalanceUpsertOnce) {
          ctx.failBalanceUpsertOnce = false;
          throw new Error('simulated ledger failure');
        }
        if (ctx.state.balances[where.userId] === undefined) ctx.state.balances[where.userId] = create.balance;
        else ctx.state.balances[where.userId] += update.balance.increment;
        return { userId: where.userId, balance: ctx.state.balances[where.userId] };
      },
    },
    creditTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        ctx.state.transactions.push({ ...data });
        return data;
      },
    },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(ctx.state);
      try {
        return await cb(prisma);
      } catch (err) {
        ctx.state = snapshot;
        throw err;
      }
    },
  };

  return { prisma: prisma as unknown as PrismaClient, ctx };
}

const baseJob: Job = {
  id: 'job1',
  userId: 'user1',
  creditsUsed: 80,
  status: 'GENERATING',
  providerJobId: falProviderJobKey('req1'),
  outputUrl: null,
};

const pendingOp = (over: Partial<Op> = {}): Op => ({
  id: 'op-seed',
  idempotencyKey: falRefundIdempotencyKey('job1'),
  status: 'PENDING',
  userId: 'user1',
  generationJobId: 'job1',
  featureKey: 'generate:fal_image',
  amount: 80,
  referenceId: falRefundIdempotencyKey('job1'),
  attempts: 0,
  lastError: null,
  createdAt: new Date(),
  ...over,
});

describe('processProviderWebhook — atomic terminal transition + refund intent', () => {
  it('creates the refund intent atomically and executes it on failure', async () => {
    const { prisma, ctx } = makeMockPrisma({ job: { ...baseJob }, balances: { user1: 0 } });
    const res = await processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'failed', errorMessage: 'boom' });
    expect(res).toMatchObject({ handled: true, outcome: 'APPLIED', refundIntentCreated: true, refundExecuted: true });
    expect(ctx.state.jobs[0].status).toBe('FAILED');
    expect(ctx.state.ops[0]).toMatchObject({ status: 'COMPLETED', idempotencyKey: falRefundIdempotencyKey('job1') });
    expect(ctx.state.balances.user1).toBe(80);
    expect(ctx.state.transactions).toHaveLength(1);
    expect(ctx.state.transactions[0]).toMatchObject({ type: 'REFUND', amount: 80, referenceId: falRefundIdempotencyKey('job1') });
  });

  it('never creates a refund intent on successful completion', async () => {
    const { prisma, ctx } = makeMockPrisma({ job: { ...baseJob }, balances: { user1: 0 } });
    const res = await processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'completed', outputUrl: 'https://cdn/x.png' });
    expect(res).toMatchObject({ handled: true, outcome: 'APPLIED', refundIntentCreated: false, refundExecuted: false });
    expect(ctx.state.jobs[0].status).toBe('COMPLETED');
    expect(ctx.state.ops).toHaveLength(0);
    expect(ctx.state.balances.user1).toBe(0);
  });

  it('treats a duplicate failure delivery as a harmless no-op', async () => {
    const { prisma, ctx } = makeMockPrisma({ job: { ...baseJob }, balances: { user1: 0 } });
    await processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'failed' });
    const second = await processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'failed' });
    expect(second).toMatchObject({ handled: false, outcome: 'ALREADY_TERMINAL', refundExecuted: false });
    expect(ctx.state.ops).toHaveLength(1);
    expect(ctx.state.transactions).toHaveLength(1);
    expect(ctx.state.balances.user1).toBe(80);
  });

  it('refunds once under concurrent duplicate failures', async () => {
    const { prisma, ctx } = makeMockPrisma({ job: { ...baseJob }, balances: { user1: 0 } });
    const [a, b] = await Promise.all([
      processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'failed' }),
      processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'failed' }),
    ]);
    expect([a, b].filter((r) => r.outcome === 'APPLIED')).toHaveLength(1);
    expect(ctx.state.ops).toHaveLength(1);
    expect(ctx.state.transactions).toHaveLength(1);
    expect(ctx.state.balances.user1).toBe(80);
  });

  it('ignores a late completion after failure (no resurrection)', async () => {
    const { prisma, ctx } = makeMockPrisma({ job: { ...baseJob }, balances: { user1: 0 } });
    await processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'failed' });
    const late = await processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'completed', outputUrl: 'https://cdn/x.png' });
    expect(late.outcome).toBe('ALREADY_TERMINAL');
    expect(ctx.state.jobs[0].status).toBe('FAILED');
  });

  it('does not refund an already-cancelled (terminal) job', async () => {
    const { prisma, ctx } = makeMockPrisma({ job: { ...baseJob, status: 'CANCELLED' }, balances: { user1: 0 } });
    const res = await processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'failed' });
    expect(res).toMatchObject({ handled: false, outcome: 'ALREADY_TERMINAL' });
    expect(ctx.state.ops).toHaveLength(0);
    expect(ctx.state.balances.user1).toBe(0);
  });

  it('returns JOB_NOT_FOUND for an unknown provider request id', async () => {
    const { prisma } = makeMockPrisma({ job: { ...baseJob } });
    const res = await processProviderWebhook(prisma, { providerJobId: 'fal:missing', outcome: 'completed' });
    expect(res).toMatchObject({ handled: false, outcome: 'JOB_NOT_FOUND' });
  });
});

describe('crash recovery + refund retries', () => {
  it('recovers a PENDING refund intent left by a crash (job already terminal)', async () => {
    const { prisma, ctx } = makeMockPrisma({
      job: { ...baseJob, status: 'FAILED' },
      ops: [pendingOp()],
      balances: { user1: 0 },
    });
    const res = await retryPendingRefundOperations(prisma);
    expect(res).toEqual({ processed: 1, executed: 1 });
    expect(ctx.state.balances.user1).toBe(80);
    expect(ctx.state.ops[0].status).toBe('COMPLETED');
    expect(ctx.state.transactions).toHaveLength(1);
  });

  it('is financially neutral when refund execution fails and is retried', async () => {
    const { prisma, ctx } = makeMockPrisma({
      job: { ...baseJob, status: 'FAILED' },
      ops: [pendingOp()],
      balances: { user1: 0 },
    });
    ctx.failBalanceUpsertOnce = true;

    const first = await retryPendingRefundOperations(prisma);
    expect(first).toEqual({ processed: 1, executed: 0 });
    expect(ctx.state.balances.user1).toBe(0);
    expect(ctx.state.ops[0].status).toBe('FAILED');
    expect(ctx.state.transactions).toHaveLength(0);

    const second = await retryPendingRefundOperations(prisma);
    expect(second).toEqual({ processed: 1, executed: 1 });
    expect(ctx.state.balances.user1).toBe(80);
    expect(ctx.state.ops[0].status).toBe('COMPLETED');
    expect(ctx.state.transactions).toHaveLength(1);
  });

  it('does not re-refund an already COMPLETED operation', async () => {
    const { prisma, ctx } = makeMockPrisma({
      job: { ...baseJob, status: 'FAILED' },
      ops: [pendingOp({ status: 'COMPLETED' })],
      balances: { user1: 80 },
    });
    const res = await retryPendingRefundOperations(prisma);
    expect(res).toEqual({ processed: 0, executed: 0 });
    expect(ctx.state.balances.user1).toBe(80);
  });
});

describe('provider execution gating (foundation regression)', () => {
  it('keeps the executeRefund dependency injectable for isolated testing', async () => {
    const { prisma } = makeMockPrisma({ job: { ...baseJob } });
    const executeRefund = vi.fn(async () => ({ executed: true, reason: 'COMPLETED' as const }));
    const res = await processProviderWebhook(prisma, { providerJobId: baseJob.providerJobId, outcome: 'failed' }, { executeRefund });
    expect(executeRefund).toHaveBeenCalledWith(prisma, falRefundIdempotencyKey('job1'));
    expect(res.refundExecuted).toBe(true);
  });
});
