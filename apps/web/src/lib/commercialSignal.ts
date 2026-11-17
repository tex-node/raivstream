/**
 * The commercial gate, shown before publish (2026-11-17).
 *
 * A gate that only fires at publish fails at the last moment. This maps the SAME verdict object the publish gate raises to the copy a creator reads, so the
 * signal and the refusal cannot disagree - a mismatch here would be the two-computations defect in the UI.
 *
 * The low-score sentences are the contract's own, and the copy is an observation, never a verdict.
 */

export type CommercialReason = 'HOOK_MISSING' | 'BENEFIT_FEATURE_LIST' | 'CTA_MISSING';

export interface CommercialVerdict {
  state: 'publish' | 'blocked' | 'unscored';
  reason?: CommercialReason | 'COMMERCIAL_UNSCORED';
  reasons?: CommercialReason[];
}

export const REASON_LABELS: Record<CommercialReason, string> = {
  HOOK_MISSING: 'Hook',
  BENEFIT_FEATURE_LIST: 'Benefit',
  CTA_MISSING: 'CTA',
};

/** The three field hints are the contract's specification - the only guidance a creator needs. */
export const BEAT_HINTS: Record<'hook' | 'benefit' | 'cta', string> = {
  hook: 'What stops the scroll — a question or a problem in the first two sentences.',
  benefit: 'What the viewer gets, in their terms — an outcome, not a feature list.',
  cta: 'What they do next, and where — the action and the place.',
};

export const REASON_SENTENCES: Record<CommercialReason, string> = {
  HOOK_MISSING: 'The hook is missing — it opens on the product rather than a reason to care. Give the viewer a question or a problem in the first two sentences.',
  BENEFIT_FEATURE_LIST: 'The benefit reads as features — say what the viewer gets, in their terms, not the product\u2019s.',
  CTA_MISSING: 'The CTA is missing — it ends without saying what happens next. Name the action and where to take it.',
};

export const UNSCORED_SENTENCE = 'This ad has not been checked yet — add the three beats above and the check runs.';

/** The one line the surface shows: the first failing beat. Nothing when the ad is complete. */
export function signalLine(verdict: CommercialVerdict | null | undefined): string | null {
  if (!verdict) return UNSCORED_SENTENCE;
  if (verdict.state === 'publish') return null;
  if (verdict.state === 'unscored') return UNSCORED_SENTENCE;
  const reason = (verdict.reason ?? verdict.reasons?.[0]) as CommercialReason | undefined;
  return reason && REASON_SENTENCES[reason] ? REASON_SENTENCES[reason] : UNSCORED_SENTENCE;
}

/** All failing beats, for the expand — still observations, in funnel order. */
export function allSignals(verdict: CommercialVerdict | null | undefined): string[] {
  if (!verdict || verdict.state !== 'blocked') return [];
  return (verdict.reasons ?? []).map((reason) => REASON_SENTENCES[reason]).filter(Boolean);
}
