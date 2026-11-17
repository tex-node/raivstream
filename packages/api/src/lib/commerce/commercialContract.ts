/**
 * The CommercialContract (2026-11-17).
 *
 * A commercial has a **hook**, a **benefit** and a **call to action** — three beats, not the story contract's five arc fields. The story contract is
 * **replaced** for COMMERCIAL projects, not run beside it: two scorers on one project is the disagreement defect this arc keeps finding, and judging an ad
 * on protagonist/resolution is the template defect.
 *
 * CONTENT FIELDS, NOT SHAPE FIELDS. A contract that requires "three sections" scores every ad 5/5; this one asks whether a hook exists, whether the benefit is
 * concrete, and whether the CTA names an action — so it can fail a bad ad for the right reason. Deterministic, like the story critique's floor detector, so it
 * can be calibrated in CI rather than trusted.
 *
 * IT GATES: an ad missing any of the three blocks publication with a reason naming the missing beat, the same fail-closed shape as the story contract's
 * RESOLUTION_MISSING gate.
 */

export const COMMERCIAL_CONTRACT_FIELDS = ['hook', 'benefit', 'cta'] as const;
export type CommercialContractField = (typeof COMMERCIAL_CONTRACT_FIELDS)[number];

export const COMMERCIAL_CONTRACT_VERSION = 1;

/** The typed reason codes: a blocked publish is a refusal with a code, never a 500. */
export type CommercialContractReason = 'HOOK_MISSING' | 'BENEFIT_FEATURE_LIST' | 'CTA_MISSING';

export interface CommercialContractFieldScore {
  present: boolean;
  score: number;
  /** What a low score MEANS, in a sentence a creator can act on. Never a number alone. */
  lowScoreMeaning: string;
}

export interface CommercialContractScore {
  hook: CommercialContractFieldScore;
  benefit: CommercialContractFieldScore;
  cta: CommercialContractFieldScore;
  /** True only when all three beats are present — the publish gate. */
  passes: boolean;
  /** Fail-closed reasons, most important first: `CTA_MISSING`, `HOOK_MISSING`, `BENEFIT_FEATURE_LIST`. */
  reasons: CommercialContractReason[];
}

const CTA_VERBS = ['shop', 'buy', 'order', 'book', 'download', 'try', 'visit', 'subscribe', 'sign up', 'get', 'start', 'join', 'call', 'claim'];

const OUTCOME_MARKERS = ['so you', 'so that', 'which means', 'lets you', 'helps you', 'gives you', 'so your', 'without', 'in minutes', 'faster', 'cleaner', 'easier', 'feel', 'look'];

const FEATURE_MARKERS = ['features', 'specs', 'specifications', 'includes', 'ingredients', 'dimensions', 'available in', 'now with', 'formula', 'contains'];

const HOOK_MARKERS = ['?', 'imagine', 'stop', 'ever', 'nobody', 'most people', 'you know', 'what if', 'they said', 'here is', "here's", 'tired of', 'sick of'];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Hook: does the ad open with a reason to care, or with the product?
 *
 * A hook is measured at the OPENING — the first two sentences — because a hook that arrives third is not a hook. Question marks, curiosity markers and a
 * first sentence that is not simply the product name all count; a bare product name scores near zero, which is the honest reading of "opens on the product
 * rather than a reason to care".
 */
export function scoreHook(text: string, productName?: string): CommercialContractFieldScore {
  const opening = sentences(text).slice(0, 2).join(' ');
  const low = opening.toLowerCase();
  const marker = HOOK_MARKERS.some((needle) => low.includes(needle));
  const opensWithProduct = Boolean(productName && low.trim().startsWith(productName.toLowerCase().trim()));
  const score = marker ? (opensWithProduct ? 55 : 85) : opensWithProduct ? 10 : 35;
  return {
    present: score >= 60,
    score: clamp(score),
    lowScoreMeaning: 'it opens on the product rather than a reason to care — give the viewer a question or a problem in the first two sentences.',
  };
}

/** Benefit: an outcome the viewer gets, or a feature list? Feature lists are the low score. */
export function scoreBenefit(text: string): CommercialContractFieldScore {
  const low = text.toLowerCase();
  const outcomes = OUTCOME_MARKERS.filter((needle) => low.includes(needle)).length;
  const features = FEATURE_MARKERS.filter((needle) => low.includes(needle)).length;
  if (outcomes === 0 && features === 0) {
    return { present: false, score: 20, lowScoreMeaning: 'it never says what the viewer gets — name one concrete outcome, not a trait of the product.' };
  }
  const score = outcomes === 0 ? 25 : clamp(60 + Math.min(30, outcomes * 15) - Math.min(30, features * 10));
  return {
    present: score >= 60,
    score,
    lowScoreMeaning: 'it lists features rather than an outcome — say what the viewer gets, in their terms, not the product\u2019s.',
  };
}

/** CTA: an imperative verb plus a destination. "Buy now" with nowhere to go is half a CTA. */
export function scoreCta(text: string): CommercialContractFieldScore {
  const tail = sentences(text).slice(-2).join(' ').toLowerCase();
  const verb = CTA_VERBS.some((needle) => tail.includes(needle));
  const destination = /(https?:\/\/|\.com|\.co|link in bio|in store|at [a-z]+ |on the app|in the app|today|now)/.test(tail);
  const score = verb ? (destination ? 90 : 55) : 0;
  return {
    present: score >= 60,
    score,
    lowScoreMeaning: 'it ends without saying what happens next — name the action and where to take it.',
  };
}

/**
 * Score an ad. Empty text is **not** a pass: an unscored or blank ad fails closed, the same way the story contract blocks an unscored story rather than
 * letting it through.
 */
export function scoreCommercialContract(text: string, productName?: string): CommercialContractScore {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    const missing = (meaning: string): CommercialContractFieldScore => ({ present: false, score: 0, lowScoreMeaning: meaning });
    return {
      hook: missing('it opens on the product rather than a reason to care — give the viewer a question or a problem in the first two sentences.'),
      benefit: missing('it never says what the viewer gets — name one concrete outcome, not a trait of the product.'),
      cta: missing('it ends without saying what happens next — name the action and where to take it.'),
      passes: false,
      reasons: ['HOOK_MISSING', 'BENEFIT_FEATURE_LIST', 'CTA_MISSING'] as CommercialContractReason[],
    };
  }

  const hook = scoreHook(trimmed, productName);
  const benefit = scoreBenefit(trimmed);
  const cta = scoreCta(trimmed);
  const reasons: CommercialContractReason[] = [];
  // FUNNEL ORDER, and it is a claim about what matters: no hook means nobody watches, no benefit means nothing is remembered, no CTA means nothing happens.
  // The first failing field is what a creator sees; ALL failures are on the returned `reasons` so the log carries the full picture.
  if (!hook.present) reasons.push('HOOK_MISSING');
  if (!benefit.present) reasons.push('BENEFIT_FEATURE_LIST');
  if (!cta.present) reasons.push('CTA_MISSING');
  return { hook, benefit, cta, passes: reasons.length === 0, reasons };
}

/**
 * The publish gate for a commercial (2026-11-17).
 *
 * THREE STATES, never two: a scored ad that passes, a scored ad that fails (first failing field in funnel order, all failures logged), and an **unscorable** ad -
 * no copy, or the scorer throwing - which is an extraction defect rather than an ad defect. Collapsing the third into the second would report a loader's mistake as
 * the creator's, exactly as `EXTRACTION_UNVERIFIED` must never collapse with `RESOLUTION_MISSING`.
 */
export type CommercialPublishVerdict =
  | { state: 'publish'; reasons: [] }
  | { state: 'blocked'; reason: CommercialContractReason; reasons: CommercialContractReason[] }
  | { state: 'unscored'; reason: 'COMMERCIAL_UNSCORED'; reasons: CommercialContractReason[] };

export function commercialPublishBlock(input: { text: string | null | undefined; productName?: string }): CommercialPublishVerdict {
  const text = String(input.text ?? '').trim();
  if (!text) {
    return { state: 'unscored', reason: 'COMMERCIAL_UNSCORED', reasons: [] };
  }
  try {
    const score = scoreCommercialContract(text, input.productName);
    if (score.passes) return { state: 'publish', reasons: [] };
    return { state: 'blocked', reason: score.reasons[0] ?? 'CTA_MISSING', reasons: score.reasons };
  } catch {
    // A scorer that throws is a defect in the instrument, not in the ad.
    return { state: 'unscored', reason: 'COMMERCIAL_UNSCORED', reasons: [] };
  }
}
