/**
 * creditFixture — the transaction shim the runner mocks were missing (2026-11-03).
 *
 * `deductCredits` does not make a single call. It:
 *   1. `creditTransaction.findUnique`         → idempotency pre-check (null = miss)
 *   2. `featureCreditRate.findUnique`         → { creditsPerUnit, isActive }
 *   3. `prisma.$transaction(fn)`              → atomic work
 *        tx.creditBalance.updateMany          → { count: 1 } when affordable, else { count: 0 }
 *        tx.creditBalance.findUnique          → the post-decrement balance
 *        tx.creditTransaction.create          → the audit row
 *   4. on P2002, reads the transaction again  → concurrent duplicate
 *
 * None of the seven runner mocks implemented `$transaction`, which is why the production
 * charge carried a tolerant `.catch(() => 0)`: the fixture could not express a charge.
 *
 * `withCreditCharge(client)` mutates and returns the client, so it can be applied at whatever
 * point a test file builds its mock — one shim, four injection shapes.
 */
export interface CreditChargeOptions {
  rate?: number;
  featureKey?: string;
  balance?: number;
  /** Restrict which feature keys get a rate; omit to rate every key. */
  featureKeys?: string[];
  /** Simulate an existing charge for the idempotency pre-check. */
  idempotentHit?: { amount: number; userId?: string; featureKey?: string } | null;
}

export function withCreditCharge<T extends Record<string, any>>(client: T, options: CreditChargeOptions = {}): T {
  const { rate = 80, featureKey = 'generate:flux2', balance = 10_000, idempotentHit = null, featureKeys } = options;
  let currentBalance = balance;

  const tx = {
    creditBalance: {
      updateMany: async () => {
        if (currentBalance < rate) return { count: 0 };
        currentBalance -= rate;
        return { count: 1 };
      },
      findUnique: async () => ({ balance: currentBalance }),
    },
    creditTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'tx_fixture', ...data }),
    },
  };

  return Object.assign(client, {
    // A rate for EVERY feature key by default: a runner test exercises images (flux2) and
    // video (h3_max) in the same run, and a fixture that only knows one key turns the other
    // into a missing-rate failure. Pass `featureKeys` to restrict it deliberately.
    featureCreditRate: {
      findUnique: async ({ where }: { where?: { featureKey?: string } } = {}) => {
        if (featureKeys && where?.featureKey && !featureKeys.includes(where.featureKey)) return null;
        return { creditsPerUnit: rate, isActive: true };
      },
    },
    creditBalance: {
      findUnique: async () => ({ balance: currentBalance }),
      updateMany: tx.creditBalance.updateMany,
    },
    creditTransaction: {
      findUnique: async () =>
        idempotentHit
          ? {
              userId: idempotentHit.userId ?? 'u1',
              featureKey: idempotentHit.featureKey ?? featureKey,
              type: 'USAGE',
              amount: -Math.abs(idempotentHit.amount),
            }
          : null,
      create: tx.creditTransaction.create,
    },
    $transaction: async <R>(fn: (client: typeof tx) => Promise<R>): Promise<R> => fn(tx),
  });
}