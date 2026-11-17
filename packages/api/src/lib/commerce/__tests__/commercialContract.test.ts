import { describe, expect, it } from 'vitest';
import { COMMERCIAL_CONTRACT_FIELDS, scoreCommercialContract } from '../commercialContract';

/**
 * The CommercialContract (2026-11-17).
 *
 * It gates, so both directions matter: an ad missing a beat must fail naming that beat, and a complete ad must pass. It scores CONTENT presence, not shape - a
 * contract that required three sections would score every ad 5/5 and teach nothing.
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
    expect(score.reasons[0]).toBe('CTA_MISSING');
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
    expect(score.reasons).toEqual(['HOOK_MISSING', 'BENEFIT_MISSING', 'CTA_MISSING']);
  });

  it('the CTA must name a destination, not only a verb', () => {
    const bare = scoreCommercialContract('What if your skin felt calm by noon? It helps you keep the barrier so your skin feels calm. Buy.');
    expect(bare.cta.present).toBe(false);
  });
});
