import { describe, expect, it } from 'vitest';
import { BEAT_HINTS, REASON_SENTENCES, allSignals, signalLine, type CommercialVerdict } from './commercialSignal';

/**
 * The gate shown before publish (2026-11-17).
 *
 * The API's thirteen contract tests already pin the scoring. These protect the SURFACE rule: the sentence a creator reads must be the sentence for the reason the
 * gate returned, an unchecked ad must not read like a bad one, a complete ad must say nothing, and the copy must never turn into a verdict.
 */
const blocked = (reasons: Array<'HOOK_MISSING' | 'BENEFIT_FEATURE_LIST' | 'CTA_MISSING'>): CommercialVerdict => ({
  state: 'blocked', reason: reasons[0], reasons,
});

describe('the signal is the gate, shown early', () => {
  it('a missing hook shows the hook sentence, and it matches the code', () => {
    const line = signalLine(blocked(['HOOK_MISSING', 'CTA_MISSING']));
    expect(line).toBe(REASON_SENTENCES.HOOK_MISSING);
    expect(line).toMatch(/hook is missing/);
  });

  it('each reason code maps to its own sentence - no shared fallback', () => {
    for (const code of ['HOOK_MISSING', 'BENEFIT_FEATURE_LIST', 'CTA_MISSING'] as const) {
      expect(signalLine(blocked([code]))).toBe(REASON_SENTENCES[code]);
    }
    // The three sentences are distinct, which is what makes the mapping testable at all.
    expect(new Set(Object.values(REASON_SENTENCES)).size).toBe(3);
  });

  it('a complete ad says nothing', () => {
    expect(signalLine({ state: 'publish', reasons: [] })).toBeNull();
  });

  it('an unchecked ad reads as unchecked, not as a missing beat', () => {
    const unscored = signalLine({ state: 'unscored', reason: 'COMMERCIAL_UNSCORED' });
    expect(unscored).toMatch(/not been checked yet/);
    expect(unscored).not.toMatch(/missing/);
  });

  it('the expand keeps funnel order and drops the line already shown', () => {
    const all = allSignals(blocked(['HOOK_MISSING', 'BENEFIT_FEATURE_LIST', 'CTA_MISSING']));
    expect(all).toEqual([REASON_SENTENCES.HOOK_MISSING, REASON_SENTENCES.BENEFIT_FEATURE_LIST, REASON_SENTENCES.CTA_MISSING]);
    expect(all.slice(1)).toHaveLength(2);
  });

  it('the copy is an observation, never a verdict', () => {
    const text = [signalLine(blocked(['HOOK_MISSING', 'CTA_MISSING'])), ...allSignals(blocked(['HOOK_MISSING', 'CTA_MISSING'])), signalLine({ state: 'unscored' }), ...Object.values(BEAT_HINTS)].join(' ');
    expect(text).not.toMatch(/poor|bad|fail|unacceptable|must fix|rejected/i);
  });
});
