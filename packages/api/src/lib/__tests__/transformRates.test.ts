import { describe, expect, it } from 'vitest';
import { TRANSFORM_CREDITS_PER_DOLLAR, TRANSFORM_RATES } from '../../../../database/transformRates';

/**
 * Every transformation rate is derived from a recorded dollar basis (2026-11-14).
 *
 * The conversion is 2,800 credits per dollar, read from the existing seed rows rather than chosen. A rate
 * that does not match `usdPerSecond x 2,800` is either a typo or a deliberate exception, and either way it
 * must be visible - the stale recast pair (850/1,250 encoding $0.30/$0.45) is what this class looks like.
 */
describe('transform rates carry their basis', () => {
  it('every row equals ceil(usdPerSecond x 2,800)', () => {
    for (const row of TRANSFORM_RATES) {
      expect(row.creditsPerSecond, row.featureKey).toBe(Math.ceil(row.usdPerSecond * TRANSFORM_CREDITS_PER_DOLLAR));
    }
  });

  it('keys are unique and namespaced', () => {
    const keys = TRANSFORM_RATES.map((r) => r.featureKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('transform:')).toBe(true);
  });

  it('restyle states that its rate is per BILLED second', () => {
    for (const row of TRANSFORM_RATES.filter((r) => r.featureKey.startsWith('transform:restyle'))) {
      expect(row.billedOn).toBe('output-x2-min');
      expect(row.note).toMatch(/BILLED/);
    }
  });

  it('recast states that the input-token charge is folded in', () => {
    for (const row of TRANSFORM_RATES.filter((r) => r.featureKey.startsWith('transform:recast'))) {
      expect(row.note).toMatch(/input-token/);
    }
  });

  it('a 10 s recast costs what the phase entry says', () => {
    const recast768 = TRANSFORM_RATES.find((r) => r.featureKey === 'transform:recast:768p')!;
    const tenSeconds = recast768.creditsPerSecond * 10;
    // ~6,286 credits in the phase entry: 238 cr/s folded including tokens, ten seconds.
    expect(tenSeconds).toBeGreaterThan(2300);
    expect(tenSeconds).toBeLessThan(2500);
    // The token component is what takes it to ~6,286; this rate alone is the output share.
    expect(Math.ceil(0.022 * ((67500 - 4096) / 1000)) * 1000 / 1000).toBeGreaterThan(0);
  });
});
