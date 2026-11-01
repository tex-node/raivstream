import { describe, expect, it } from 'vitest';
import {
  payoutForPinnedTerms,
  resolvePinnedTerms,
  termsEffectiveOn,
  type RevenueTermsRow,
} from '../termsPinning';

const d = (iso: string) => new Date(iso);

const T1: RevenueTermsRow = { id: 'terms-1', shareBps: 500, effectiveFrom: d('2026-01-01'), effectiveTo: null };
const T2: RevenueTermsRow = { id: 'terms-2', shareBps: 900, effectiveFrom: d('2026-06-01'), effectiveTo: null };

const acceptedUnderT1 = { acceptedRevenueTermsId: 'terms-1' };

describe('terms pinning — the decision that protects an accepted film', () => {
  it('changing the terms table does not change an accepted film’s pinned terms', () => {
    // The operator adds a better-for-the-house row and edits it later.
    const before = [T1];
    const after = [T1, T2];

    expect(resolvePinnedTerms(acceptedUnderT1, before)?.id).toBe('terms-1');
    expect(resolvePinnedTerms(acceptedUnderT1, after)?.id).toBe('terms-1');
  });

  it('changing the terms table does not change an accepted film’s payout', () => {
    const gross = 1_000_00; // 1,000.00
    const before = payoutForPinnedTerms(acceptedUnderT1, [T1], gross);
    const after = payoutForPinnedTerms(acceptedUnderT1, [T1, T2], gross);
    expect(before).toEqual({ amountCents: 5_000 });
    expect(after).toEqual({ amountCents: 5_000 });
  });

  it('an unpinned submission is refused, not priced with whatever is effective now', () => {
    // No accepted terms → no payout. A "latest effective" fallback would pay the
    // filmmaker under a contract they never accepted.
    expect(resolvePinnedTerms({ acceptedRevenueTermsId: null }, [T1, T2])).toBeNull();
    expect(payoutForPinnedTerms({ acceptedRevenueTermsId: null }, [T1, T2], 1_000_00)).toBeNull();
  });

  it('a pinned id that no longer exists resolves to null rather than the nearest row', () => {
    expect(resolvePinnedTerms(acceptedUnderT1, [T2])).toBeNull();
  });
});

describe('effective-date ranges', () => {
  it('selects the row whose range covers the date', () => {
    expect(termsEffectiveOn([T1], d('2026-03-01'))?.id).toBe('terms-1');
    expect(termsEffectiveOn([T1, T2], d('2025-12-31'))).toBeNull();
  });

  it('honours an inclusive end date and prefers the most recent start on overlap', () => {
    const bounded: RevenueTermsRow = {
      id: 'terms-3',
      shareBps: 700,
      effectiveFrom: d('2026-06-01'),
      effectiveTo: d('2026-12-31'),
    };
    expect(termsEffectiveOn([bounded], d('2026-12-31'))?.id).toBe('terms-3');
    expect(termsEffectiveOn([T2, bounded], d('2026-07-01'))?.shareBps).toBe(700);
  });
});

describe('payout arithmetic is integer basis points', () => {
  it('floors to the cent and never rounds up', () => {
    const odd: RevenueTermsRow = { id: 'terms-4', shareBps: 333, effectiveFrom: d('2026-01-01'), effectiveTo: null };
    expect(payoutForPinnedTerms({ acceptedRevenueTermsId: 'terms-4' }, [odd], 99)).toEqual({ amountCents: 3 });
  });
});
