import { describe, expect, it } from 'vitest';
import {
  buildMovieRenderPlan,
  calculateExpectedRenderDuration,
  calculateRenderedSegmentDuration,
  durationWithinTolerance,
  hashRenderPlan,
  isEligibleMovieRenderAsset,
  renderReadiness,
  shouldReuseMovieRenderJob,
} from '../movieRenderPlanning';
import type { FilmBlueprint } from '../sequencePlanning';

const blueprint: FilmBlueprint = {
  sequenceId: 'seq_1',
  version: 2,
  runtimeSeconds: 8,
  transitionRule: 'overlap_transitions_do_not_add_runtime',
  shots: [
    {
      sequenceSceneId: 'entry_1',
      storySceneId: 'scene_1',
      assetId: 'asset_1',
      order: 1,
      enabled: true,
      durationSeconds: 4,
      shotType: 'MEDIUM',
      cameraMovement: 'PUSH_IN',
      cameraSpeed: 'NORMAL',
      cameraSpeedMultiplier: 1,
      transition: 'NONE',
      transitionDurationSeconds: 0,
      holdDurationSeconds: 0,
      zoom: 1.05,
    },
    {
      sequenceSceneId: 'entry_2',
      storySceneId: 'scene_2',
      assetId: 'asset_2',
      order: 2,
      enabled: true,
      durationSeconds: 4,
      shotType: 'WIDE',
      cameraMovement: 'PAN_RIGHT',
      cameraSpeed: 'SLOW',
      cameraSpeedMultiplier: 1,
      transition: 'CROSS_DISSOLVE',
      transitionDurationSeconds: 0.5,
      holdDurationSeconds: 0,
      zoom: 1,
    },
  ],
};

const assetsById = new Map([
  ['asset_1', { id: 'asset_1', sceneId: 'scene_1', assetType: 'IMAGE', status: 'READY', assetUrl: 'https://cdn.test/a.png', creativeStatus: 'APPROVED' }],
  ['asset_2', { id: 'asset_2', sceneId: 'scene_2', assetType: 'IMAGE', status: 'READY', assetUrl: 'https://cdn.test/b.png', creativeStatus: 'DRAFT' }],
]);

describe('movieRenderPlanning', () => {
  it('builds a deterministic render plan from the Phase 9A Film Blueprint', () => {
    const plan = buildMovieRenderPlan({ filmBlueprint: blueprint, assetsById });
    const repeat = buildMovieRenderPlan({ filmBlueprint: blueprint, assetsById });

    expect(plan.runtimeSeconds).toBe(8);
    expect(plan.shots).toHaveLength(2);
    expect(plan.shots[0].sourceUrl).toBe('https://cdn.test/a.png');
    expect(plan.shots[1].transition).toBe('CROSS_DISSOLVE');
    expect(hashRenderPlan(plan)).toBe(hashRenderPlan(repeat));
  });

  it('rejects missing or rejected selected assets', () => {
    expect(() => buildMovieRenderPlan({ filmBlueprint: blueprint, assetsById: new Map() })).toThrow(/Shot 1/);
    expect(isEligibleMovieRenderAsset({ id: 'bad', sceneId: 'scene', assetType: 'IMAGE', status: 'READY', assetUrl: 'x', creativeStatus: 'REJECTED' })).toBe(false);
  });

  it('reports readiness and idempotency reuse decisions', () => {
    const plan = buildMovieRenderPlan({ filmBlueprint: blueprint, assetsById });
    const hash = hashRenderPlan(plan);

    expect(renderReadiness(plan)).toMatchObject({ ready: true, shotCount: 2, runtimeSeconds: 8 });
    expect(shouldReuseMovieRenderJob({ renderPlanHash: hash, status: 'READY' }, hash)).toBe(true);
    expect(shouldReuseMovieRenderJob({ renderPlanHash: 'other', status: 'READY' }, hash)).toBe(false);
    expect(shouldReuseMovieRenderJob({ renderPlanHash: hash, status: 'FAILED' }, hash)).toBe(false);
  });

  it('uses shot screen duration as the canonical movie runtime', () => {
    expect(calculateExpectedRenderDuration([
      { durationSeconds: 3 },
      { durationSeconds: 4 },
      { durationSeconds: 5 },
    ])).toBe(12);
  });

  it('keeps cross-dissolve handles out of the final screen runtime', () => {
    const oneDissolve = [
      { durationSeconds: 5, transition: 'NONE', transitionDurationSeconds: 0 },
      { durationSeconds: 5, transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 1 },
    ];

    expect(calculateExpectedRenderDuration(oneDissolve)).toBe(10);
    expect(calculateRenderedSegmentDuration(oneDissolve[0])).toBe(5);
    expect(calculateRenderedSegmentDuration(oneDissolve[1])).toBe(6);
  });

  it('handles multiple consecutive dissolves without changing expected runtime', () => {
    const shots = [
      { durationSeconds: 3, transition: 'NONE', transitionDurationSeconds: 0 },
      { durationSeconds: 4, transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 0.5 },
      { durationSeconds: 5, transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 0.5 },
    ];

    expect(calculateExpectedRenderDuration(shots)).toBe(12);
    expect(shots.map(calculateRenderedSegmentDuration)).toEqual([3, 4.5, 5.5]);
  });

  it('uses rendered transition fallbacks for deterministic timing', () => {
    const mixedBlueprint: FilmBlueprint = {
      ...blueprint,
      runtimeSeconds: 12,
      shots: [
        { ...blueprint.shots[0], order: 1, durationSeconds: 3, transition: 'NONE', transitionDurationSeconds: 0 },
        { ...blueprint.shots[1], order: 2, durationSeconds: 4, transition: 'MATCH_CUT', transitionDurationSeconds: 1 },
        { ...blueprint.shots[1], sequenceSceneId: 'entry_3', storySceneId: 'scene_3', assetId: 'asset_2', order: 3, durationSeconds: 5, transition: 'DIP_TO_BLACK', transitionDurationSeconds: 0.5 },
      ],
    };
    const plan = buildMovieRenderPlan({ filmBlueprint: mixedBlueprint, assetsById });

    expect(plan.runtimeSeconds).toBe(12);
    expect(plan.shots[1].transition).toBe('CUT');
    expect(plan.shots[1].renderDurationSeconds).toBe(4);
    expect(plan.shots[2].transition).toBe('DIP_TO_BLACK');
    expect(plan.shots[2].renderDurationSeconds).toBe(5.5);
  });

  it('checks duration tolerance strictly', () => {
    expect(durationWithinTolerance({ expectedSeconds: 12, actualSeconds: 11.9 }).ok).toBe(true);
    expect(durationWithinTolerance({ expectedSeconds: 12, actualSeconds: 8.566667 }).ok).toBe(false);
  });
});
