import { describe, it, expect } from 'vitest';
import { estimateModelCreditCost, estimatePerSecondCosts, PER_SECOND_DEFAULT_SECONDS } from '../generationCost';

/**
 * D-002 - the UI advertised `creditCost` from the FLAT key (300 for Fabric) while
 * `generation.create` billed the per-second key (420/s x 5s = 2,100). The estimate
 * must mirror the charge path exactly, including the flag that selects it.
 */

// Rates as configured in production (feature_credit_rates).
const RATES: Record<string, number> = {
  'generate:flux2': 80,
  'generate:veed_fabric': 300,
  'generate:veed_fabric_720p': 420,
  'generate:veed_fabric_480p': 225,
  'generate:h3_max': 200,
  'generate:h3_max_768p': 128,
};

describe('estimateModelCreditCost', () => {
  it('uses the per-second key for VEED_FABRIC when the flag is on', () => {
    const cost = estimateModelCreditCost({ model: 'VEED_FABRIC', rateMap: RATES, perSecondEnabled: true });
    expect(cost).toBe(420 * PER_SECOND_DEFAULT_SECONDS); // 2100
  });

  it('falls back to the flat key when the flag is off', () => {
    const cost = estimateModelCreditCost({ model: 'VEED_FABRIC', rateMap: RATES, perSecondEnabled: false });
    expect(cost).toBe(300);
  });

  it('uses the per-second key for H3_MAX when the flag is on', () => {
    const cost = estimateModelCreditCost({ model: 'H3_MAX', rateMap: RATES, perSecondEnabled: true });
    expect(cost).toBe(128 * PER_SECOND_DEFAULT_SECONDS); // 640
  });

  it('leaves flat-rate models untouched regardless of the flag', () => {
    expect(estimateModelCreditCost({ model: 'FLUX2', rateMap: RATES, perSecondEnabled: true })).toBe(80);
    expect(estimateModelCreditCost({ model: 'FLUX2', rateMap: RATES, perSecondEnabled: false })).toBe(80);
  });

  it('honours an explicit duration', () => {
    const cost = estimateModelCreditCost({
      model: 'VEED_FABRIC', rateMap: RATES, perSecondEnabled: true, seconds: 10,
    });
    expect(cost).toBe(4_200);
  });

  it('returns null when no rate is configured', () => {
    expect(estimateModelCreditCost({ model: 'VEED_FABRIC', rateMap: {}, perSecondEnabled: true })).toBeNull();
  });
});

describe('estimatePerSecondCosts', () => {
  it('returns every resolution price for VEED_FABRIC', () => {
    const costs = estimatePerSecondCosts({ model: 'VEED_FABRIC', rateMap: RATES });
    expect(costs).toEqual({ '480p': 225 * 5, '720p': 420 * 5 });
    expect(costs?.['480p']).toBe(1125);
    expect(costs?.['720p']).toBe(2100);
  });

  it('returns null for flat-rate models', () => {
    expect(estimatePerSecondCosts({ model: 'FLUX2', rateMap: RATES })).toBeNull();
  });

  it('omits resolutions with no configured rate', () => {
    const costs = estimatePerSecondCosts({ model: 'H3_MAX', rateMap: { 'generate:h3_max_768p': 128 } });
    expect(costs).toEqual({ '768P': 640 });
  });
});
