import { describe, it, expect } from 'vitest';
import { reconcileRows, type BalanceLedgerRow } from '../creditReporting';
import { insufficientCreditsError } from '../credits';

describe('reconcileRows (PL-01)', () => {
  const row = (userId: string, balance: number, ledgerSum: number, ledgerCount = 1): BalanceLedgerRow => ({
    userId, username: userId, balance, ledgerSum, ledgerCount,
  });

  it('marks users whose balance equals the ledger sum as in sync', () => {
    const { rows, summary } = reconcileRows([
      row('a', 500, 500),
      row('b', 0, 0),
    ]);
    expect(rows.every((r) => r.inSync)).toBe(true);
    expect(summary).toMatchObject({ totalUsers: 2, usersInSync: 2, usersWithDiscrepancy: 0, totalDiscrepancy: 0, absDiscrepancy: 0 });
  });

  it('computes signed and absolute discrepancies', () => {
    const { rows, summary } = reconcileRows([
      row('a', 700, 500),   // +200 (balance > ledger)
      row('b', 100, 400),   // -300 (balance < ledger)
      row('c', 50, 50),     // in sync
    ]);
    expect(rows.find((r) => r.userId === 'a')!.discrepancy).toBe(200);
    expect(rows.find((r) => r.userId === 'b')!.discrepancy).toBe(-300);
    expect(summary.totalDiscrepancy).toBe(-100);
    expect(summary.absDiscrepancy).toBe(500);
    expect(summary.usersWithDiscrepancy).toBe(2);
  });

  it('flags a positive balance with no ledger rows as a discrepancy', () => {
    const { rows } = reconcileRows([row('legacy', 300, 0, 0)]);
    expect(rows[0].discrepancy).toBe(300);
    expect(rows[0].inSync).toBe(false);
  });
});

describe('insufficientCreditsError (R16-01)', () => {
  it('carries a structured payload on cause.credit', () => {
    const err = insufficientCreditsError('generate:flux', 80, 30);
    expect(err.code).toBe('PAYMENT_REQUIRED');
    expect((err.cause as unknown as { credit: unknown }).credit).toEqual({
      required: 80,
      balance: 30,
      shortfall: 50,
      featureKey: 'generate:flux',
    });
  });

  it('never reports a negative shortfall when the balance covers the cost', () => {
    const err = insufficientCreditsError('generate:flux', 80, 200);
    expect((err.cause as unknown as { credit: { shortfall: number } }).credit.shortfall).toBe(0);
  });
});
