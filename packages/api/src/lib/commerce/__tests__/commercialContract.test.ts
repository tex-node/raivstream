import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_CONTRACT_FIELDS,
  commercialPublishBlock,
  scoreCommercialContract,
  type CommercialPublishVerdict,
} from '../commercialContract';

// Narrowing helper: `expect(...)` does not narrow a union for TypeScript, so the blocked shape is asserted once.
function blocked(verdict: CommercialPublishVerdict) {
  if (verdict.state !== 'blocked') throw new Error(`expected blocked, got ${verdict.state}`);
  return verdict;
}

/**
 * The CommercialContract and its publish gate (2026-11-17).
 *
 * The contract scores CONTENT presence, not shape - a contract requiring three sections would score every ad 5/5. The gate has THREE states, never two: a scored
 * pass, a scored block naming the FIRST failing field in funnel order with all failures kept, and an UNSCORED ad, which is an instrument defect rather than a
 * creator's mistake.
 */
const COMPLETE = `Ever wonder why your skincare stops working by noon? Our serum keeps the barrier intact through the day, so your skin feels calm from morning to night. Shop the range at our store today.`;

describe('the contract scores content, not shape', () => {
  it('has exactly three fields', () => {
    expect([...COMMERCIAL_CONTRACT_FIELDS]).toEqual(['hook', 'benefit', 'cta']);
  });

  it('a complete ad passes on all three', () => {
    const score = scoreCommercialContract(COMPLETE);
    expect(score.passes).toBe(true);
    expect(score.reasons).toEqual([]);
  });

  it('an ad with no CTA fails naming the CTA', () => {
    const score = scoreCommercialContract('Ever wonder why your skincare stops working by noon? It keeps the barrier intact so your skin feels calm all day.');
    expect(score.passes).toBe(false);
    expect(score.reasons).toContain('CTA_MISSING');
    expect(score.cta.lowScoreMeaning).toMatch(/what happens next/);
  });

  it('an ad that opens on the product fails the hook', () => {
    const score = scoreCommercialContract('Our serum is a light daily serum. It helps you keep a calm barrier, so your skin feels better. Buy now at our store.');
    expect(score.hook.present).toBe(false);
    expect(score.reasons).toContain('HOOK_MISSING');
  });

  it('a feature list fails the benefit, and the sentence says why', () => {
    const score = scoreCommercialContract('What if your routine had fewer steps? Specs: 30ml, includes vitamin C, contains glycerin. Shop at our store today.');
    expect(score.benefit.present).toBe(false);
    expect(score.benefit.lowScoreMeaning).toMatch(/features rather than an outcome/);
  });

  it('an empty ad fails closed rather than passing by default', () => {
    const score = scoreCommercialContract('   ');
    expect(score.passes).toBe(false);
    expect(score.reasons).toEqual(['HOOK_MISSING', 'BENEFIT_FEATURE_LIST', 'CTA_MISSING']);
  });

  it('the CTA must name a destination, not only a verb', () => {
    const bare = scoreCommercialContract('What if your skin felt calm by noon? It helps you keep the barrier so your skin feels calm. Buy.');
    expect(bare.cta.present).toBe(false);
  });
});

describe('a commercial publishes or is refused, never half-checked', () => {
  it('a complete ad publishes', () => {
    expect(commercialPublishBlock({ text: COMPLETE }).state).toBe('publish');
  });

  it('an ad missing the CTA blocks naming the CTA', () => {
    const verdict = blocked(commercialPublishBlock({ text: 'Ever wonder why your skincare stops working by noon? It keeps the barrier intact so your skin feels calm all day.' }));
    expect(verdict.reason).toBe('CTA_MISSING');
  });

  it('an ad missing the hook and the CTA surfaces HOOK first and keeps all failures', () => {
    // A feature list with no outcome fails the benefit as well, so all three failures are real here.
    const verdict = blocked(commercialPublishBlock({ text: 'Our serum is a light daily serum. Specs: 30ml, includes vitamin C.' }));
    // Funnel order: no hook means nobody watches, so the mouth of the funnel leads.
    expect(verdict.reason).toBe('HOOK_MISSING');
    expect(verdict.reasons).toContain('BENEFIT_FEATURE_LIST');
    expect(verdict.reasons).toContain('CTA_MISSING');
  });

  it('an empty ad is UNSCORED, not an ad missing all three', () => {
    const verdict = commercialPublishBlock({ text: '   ' });
    if (verdict.state !== 'unscored') throw new Error(`expected unscored, got ${verdict.state}`);
    expect(verdict.reason).toBe('COMMERCIAL_UNSCORED');
    // A missing-copy refusal must not look like a creator's writing failure.
    expect(verdict.reasons).toEqual([]);
  });

  it('a null or absent body is unscored rather than throwing', () => {
    expect(commercialPublishBlock({ text: null }).state).toBe('unscored');
    expect(commercialPublishBlock({ text: undefined }).state).toBe('unscored');
  });

  it('the funnel order is the contract own, not the gate invention', () => {
    const score = scoreCommercialContract('Our serum is light. Specs: 30ml, includes vitamin C. Buy.');
    expect(score.reasons[0]).toBe('HOOK_MISSING');
  });
});
