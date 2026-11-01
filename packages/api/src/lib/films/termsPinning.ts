/**
 * Phase 3.5 — terms pinning.
 *
 * THE DECISION THIS FILE ENCODES: an accepted film is paid under the terms that
 * were in force **when it was accepted**, not the terms in force when the payout
 * runs. RevenueTerms is an effective-dated range; FilmSubmission pins one row by
 * id. Editing the terms table afterwards must therefore not move a cent for a film
 * that is already accepted — otherwise an operator's future edit retroactively
 * changes a filmmaker's contract.
 *
 * These are pure functions on purpose: the pinning rule is the thing worth testing,
 * and it can be tested before any consumer exists.
 */

export interface RevenueTermsRow {
  id: string;
  shareBps: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface PinnedSubmission {
  acceptedRevenueTermsId: string | null;
}

/** The terms row whose inclusive range covers `at`, or null when none does. */
export function termsEffectiveOn(rows: RevenueTermsRow[], at: Date): RevenueTermsRow | null {
  const covering = rows.filter(
    (row) => row.effectiveFrom.getTime() <= at.getTime() &&
      (row.effectiveTo === null || row.effectiveTo.getTime() >= at.getTime()),
  );
  if (covering.length === 0) return null;
  // Latest start wins when ranges overlap; that is the operator's most recent word.
  // On a tie the BOUNDED row wins: a range with an end date is the more specific
  // contract, and an open-ended row starting the same day is the default it refines.
  return covering.reduce((a, b) => {
    if (a.effectiveFrom.getTime() !== b.effectiveFrom.getTime()) {
      return a.effectiveFrom > b.effectiveFrom ? a : b;
    }
    if (a.effectiveTo === null && b.effectiveTo !== null) return b;
    if (b.effectiveTo === null && a.effectiveTo !== null) return a;
    return a;
  });
}

/**
 * Resolve the terms a payout uses. **Only** the pinned id is consulted.
 *
 * There is deliberately no "fall back to the terms effective at payout time" branch:
 * that fallback is exactly the bug this design exists to prevent, and an unpinned
 * payout must be refused rather than silently priced with someone else's terms.
 */
export function resolvePinnedTerms(
  submission: PinnedSubmission,
  rows: RevenueTermsRow[],
): RevenueTermsRow | null {
  if (!submission.acceptedRevenueTermsId) return null;
  return rows.find((row) => row.id === submission.acceptedRevenueTermsId) ?? null;
}

/**
 * A payout amount from the pinned terms. Integer basis points, floored to the cent —
 * money is never float-rounded in this path.
 */
export function payoutForPinnedTerms(
  submission: PinnedSubmission,
  rows: RevenueTermsRow[],
  grossCents: number,
): { amountCents: number } | null {
  const terms = resolvePinnedTerms(submission, rows);
  if (!terms) return null;
  return { amountCents: Math.floor((grossCents * terms.shareBps) / 10_000) };
}
