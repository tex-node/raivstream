import { describe, it, expect } from 'vitest';
import { passesIdentityGate, recommendationForResult } from '../qualityScorer';

/**
 * Per-dimension gate: APPROVE requires overall >= 80 AND characterIdentity >= 85.
 *
 * The mixed cases are the ones that matter: a good composition must not carry a
 * drifted character, and a great character must not carry a weak composition.
 */
function decide(overallScore: number, characterIdentity: number | undefined) {
  const scores = characterIdentity === undefined ? {} : { characterIdentity };
  return recommendationForResult({ overallScore, scores });
}

describe('per-dimension approval gate (overall >= 80 AND identity >= 85)', () => {
  // The diagonal: both axes at their boundaries.
  const matrix: Array<[number, number, string, string]> = [
    [79, 84, 'SUGGEST_REFINEMENT', 'both below: overall under threshold, identity under threshold'],
    [79, 85, 'SUGGEST_REFINEMENT', 'identity ok, overall below'],
    [79, 86, 'SUGGEST_REFINEMENT', 'identity ok, overall below'],
    [80, 84, 'SUGGEST_REFINEMENT', 'overall exactly at threshold, identity below'],
    [80, 85, 'APPROVE', 'both exactly at threshold'],
    [80, 86, 'APPROVE', 'overall at threshold, identity above'],
    [81, 84, 'SUGGEST_REFINEMENT', 'overall above, identity below'],
    [81, 85, 'APPROVE', 'both above'],
    [81, 86, 'APPROVE', 'both above'],
  ];

  it.each(matrix)('overall %i / identity %i -> %s (%s)', (overall, identity, expected) => {
    expect(decide(overall, identity)).toBe(expected);
  });

  it('rejects an asset that passes overall but fails identity (the reason for the change)', () => {
    expect(decide(85, 84)).toBe('SUGGEST_REFINEMENT');
  });

  it('rejects an asset with a great character and a poor overall (proves it is not identity-only)', () => {
    expect(decide(79, 95)).toBe('SUGGEST_REFINEMENT');
    expect(decide(69, 95)).toBe('REGENERATE');
  });

  it('fails closed when the identity score is missing or non-numeric', () => {
    expect(decide(95, undefined)).toBe('SUGGEST_REFINEMENT');
    expect(recommendationForResult({ overallScore: 95, scores: { characterIdentity: Number.NaN } })).toBe(
      'SUGGEST_REFINEMENT',
    );
    expect(passesIdentityGate({ characterIdentity: undefined })).toBe(false);
    expect(passesIdentityGate(null)).toBe(false);
  });

  it('does not derive identity from the aggregate', () => {
    // A high aggregate with a missing characterIdentity must still fail closed.
    expect(recommendationForResult({ overallScore: 95, scores: { composition: 99, lighting: 99 } })).toBe(
      'SUGGEST_REFINEMENT',
    );
  });
});
