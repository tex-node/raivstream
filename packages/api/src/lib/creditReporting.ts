/**
 * PL-01 — credit usage reporting + balance reconciliation helpers.
 *
 * Pure functions only: the admin router performs the Prisma reads and feeds the
 * normalized rows in. Keeping the accounting math here makes the invariant
 * testable without a database.
 *
 * Accounting invariant (verified, not enforced):
 *   SUM(CreditTransaction.amount) === CreditBalance.balance
 * for every user, given that every balance mutation writes exactly one ledger
 * row and opening balances are zero. Historical rows, opening balances or
 * out-of-band adjustments can legitimately break this — the reconciler reports
 * discrepancies and never mutates balances.
 */

export interface BalanceLedgerRow {
  userId: string;
  username: string | null;
  email?: string | null;
  /** Authoritative balance from credit_balances. */
  balance: number;
  /** SUM(CreditTransaction.amount) for the user; 0 when there are no rows. */
  ledgerSum: number;
  /** COUNT(CreditTransaction) for the user. */
  ledgerCount: number;
}

export interface ReconcileRow extends BalanceLedgerRow {
  /** balance − ledgerSum. Negative = balance lower than the ledger implies. */
  discrepancy: number;
  inSync: boolean;
}

export interface ReconcileSummary {
  totalUsers: number;
  usersInSync: number;
  usersWithDiscrepancy: number;
  /** Sum of signed discrepancies across all users. */
  totalDiscrepancy: number;
  /** Sum of absolute discrepancies (magnitude of potential remediation). */
  absDiscrepancy: number;
}

export function reconcileRows(rows: BalanceLedgerRow[]): {
  rows: ReconcileRow[];
  summary: ReconcileSummary;
} {
  const out: ReconcileRow[] = rows.map((r) => {
    const discrepancy = r.balance - r.ledgerSum;
    return { ...r, discrepancy, inSync: discrepancy === 0 };
  });

  const summary: ReconcileSummary = {
    totalUsers:       out.length,
    usersInSync:      out.filter((r) => r.inSync).length,
    usersWithDiscrepancy: out.filter((r) => !r.inSync).length,
    totalDiscrepancy: out.reduce((acc, r) => acc + r.discrepancy, 0),
    absDiscrepancy:   out.reduce((acc, r) => acc + Math.abs(r.discrepancy), 0),
  };

  return { rows: out, summary };
}
