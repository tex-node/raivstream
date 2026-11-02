import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIMENSION_FLOORS,
  dimensionFloorBreaches,
  dimensionFloors,
  passesDimensionFloors,
  recommendationForResult,
  type CreativeDimension,
} from '../qualityScorer';

/**
 * The SCENE_03 case is the reason this gate exists.
 *
 * Production, lighthouse run 2026-11-02, project cmvylvazc…: SCENE_03 was scored
 *
 *   overall: 85, characterIdentity: 0, storyAlignment: 75, …
 *
 * and the character was absent from the frame. Under the aggregate-only gate that
 * asset would have been APPROVED — 85 clears the 80 threshold — and no aggregate
 * cut-off separates it from SCENE_01 (also 85, identity 80). The gate has to read
 * the dimensions, so these tests are named after the real row rather than a fixture.
 */

const DIMENSIONS = Object.keys(DEFAULT_DIMENSION_FLOORS) as CreativeDimension[];

/** A vector that clears every floor and the aggregate. */
function passing(overrides: Partial<Record<CreativeDimension, number>> = {}) {
  return {
    ...Object.fromEntries(DIMENSIONS.map((d) => [d, 90])),
    ...overrides,
  } as Record<string, number>;
}

describe('per-dimension floors', () => {
  it('has a floor for every dimension the critic scores', () => {
    expect(DIMENSIONS.sort()).toEqual(
      [
        'characterIdentity',
        'continuity',
        'composition',
        'lighting',
        'emotion',
        'visualStyle',
        'environment',
        'storyAlignment',
        'sceneClarity',
        'technicalQuality',
      ].sort(),
    );
  });

  // One case just below the floor (fails), one exactly at it (passes), one above (passes).
  for (const dimension of DIMENSIONS) {
    const floor = DEFAULT_DIMENSION_FLOORS[dimension];
    it(`${dimension}: ${floor - 1} fails, ${floor} passes, ${floor + 5} passes`, () => {
      expect(passesDimensionFloors(passing({ [dimension]: floor - 1 }))).toBe(false);
      expect(passesDimensionFloors(passing({ [dimension]: floor }))).toBe(true);
      expect(passesDimensionFloors(passing({ [dimension]: floor + 5 }))).toBe(true);
    });
  }
});

describe('the aggregate and the dimensions are both gates', () => {
  it('a uniformly mediocre asset passes every dimension but fails the aggregate', () => {
    // Every dimension 82 clears its floor (max floor is 85 for identity, so use 90 for it).
    const mediocre = passing({ characterIdentity: 90, continuity: 82, composition: 82, lighting: 82, emotion: 82, visualStyle: 82, environment: 82, storyAlignment: 82, sceneClarity: 82, technicalQuality: 82 });
    expect(passesDimensionFloors(mediocre)).toBe(true);
    // Overall 79 < 80: the aggregate still rejects it.
    expect(recommendationForResult({ overallScore: 79, scores: mediocre })).toBe('SUGGEST_REFINEMENT');
  });

  it('an asset that clears the aggregate but breaches one dimension is not approved', () => {
    expect(recommendationForResult({ overallScore: 88, scores: passing({ lighting: 69 }) })).toBe('SUGGEST_REFINEMENT');
  });
});

describe('the SCENE_03 acceptance case', () => {
  /** The real row: character absent, aggregate unmoved. */
  const SCENE_03 = {
    characterIdentity: 0,
    continuity: 80,
    composition: 90,
    lighting: 95,
    emotion: 85,
    visualStyle: 80,
    environment: 90,
    storyAlignment: 75,
    sceneClarity: 85,
    technicalQuality: 90,
  };

  it('overall 85 with characterIdentity 0 must not be approved', () => {
    // Before this gate: overall 85 >= 80 would have passed it. SCENE_01, also 85
    // with identity 80, is the asset no aggregate cut-off could distinguish.
    expect(recommendationForResult({ overallScore: 85, scores: SCENE_03 })).toBe('SUGGEST_REFINEMENT');
  });

  it('names the breached dimension rather than just failing', () => {
    expect(dimensionFloorBreaches(SCENE_03)).toEqual(['characterIdentity']);
  });

  it('the same aggregate with a present character is approved (SCENE_01)', () => {
    expect(recommendationForResult({ overallScore: 85, scores: passing({ characterIdentity: 80 }) })).toBe('SUGGEST_REFINEMENT');
    // identity floor is 85, so 80 still fails by design — SCENE_01's 80 is below the
    // identity floor, which is exactly the stricter rule this phase installed.
    expect(passesDimensionFloors({ ...SCENE_03, characterIdentity: 85 })).toBe(true);
    expect(recommendationForResult({ overallScore: 85, scores: { ...SCENE_03, characterIdentity: 85 } })).toBe('APPROVE');
  });
});

describe('fail-closed on missing or non-numeric dimensions', () => {
  it('a vector missing characterIdentity entirely fails', () => {
    const missing: Record<string, number> = passing();
    delete missing.characterIdentity;
    expect(passesDimensionFloors(missing)).toBe(false);
    expect(dimensionFloorBreaches(missing)).toContain('characterIdentity');
  });

  it('a null, string-garbage, or NaN dimension fails rather than being exempt', () => {
    for (const bad of [null, 'n/a', Number.NaN, undefined] as unknown[]) {
      const scores = { ...passing(), lighting: bad as number };
      expect(passesDimensionFloors(scores as Record<string, unknown>)).toBe(false);
    }
  });

  it('a null scores object fails everything', () => {
    expect(passesDimensionFloors(null)).toBe(false);
    expect(passesDimensionFloors(undefined)).toBe(false);
  });
});

describe('thresholds are data', () => {
  it('overrides merge over the table rather than replacing it', () => {
    const floors = dimensionFloors({ lighting: 95 });
    expect(floors.lighting).toBe(95);
    expect(floors.characterIdentity).toBe(DEFAULT_DIMENSION_FLOORS.characterIdentity);
  });

  it('the legacy identityThreshold option still moves the identity floor', () => {
    const scores = passing({ characterIdentity: 80 });
    expect(recommendationForResult({ overallScore: 90, scores })).toBe('SUGGEST_REFINEMENT');
    expect(recommendationForResult({ overallScore: 90, scores }, { identityThreshold: 75 })).toBe('APPROVE');
  });
});
