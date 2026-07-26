import { describe, expect, it } from 'vitest';
import { aggregatePartialScores, aggregateScore, clampScore, recommendationForScore } from '../qualityScorer';

describe('creative critic scoring', () => {
  const completeScores = {
    characterIdentity: 90,
    continuity: 80,
    composition: 70,
    lighting: 60,
    emotion: 100,
    visualStyle: 90,
    environment: 80,
    storyAlignment: 70,
    sceneClarity: 60,
    technicalQuality: 100,
  };

  it('aggregates all category scores', () => {
    expect(aggregateScore(completeScores)).toBe(80);
  });

  it('aggregates partial scores and ignores invalid numeric input', () => {
    expect(aggregatePartialScores({ a: 100, b: 'bad', c: 50, d: undefined })).toBe(75);
  });

  it('supports weighted scoring', () => {
    expect(aggregatePartialScores({ character: 100, technical: 50 }, { character: 3, technical: 1 })).toBe(87.5);
  });

  it('clamps invalid and out-of-range scores to 0-100', () => {
    expect(clampScore(-20)).toBe(0);
    expect(clampScore(120)).toBe(100);
    expect(clampScore('nope')).toBe(0);
  });

  it('makes threshold decisions', () => {
    expect(recommendationForScore(90, 90)).toBe('APPROVE');
    expect(recommendationForScore(89, 90)).toBe('SUGGEST_REFINEMENT');
    expect(recommendationForScore(69, 90)).toBe('REGENERATE');
    expect(recommendationForScore(85, 80)).toBe('APPROVE');
  });
});
