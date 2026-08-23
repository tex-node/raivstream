import { describe, expect, it } from 'vitest';
import {
  buildFilmBlueprint,
  clampCameraSpeedMultiplier,
  clampSequenceDuration,
  clampTransitionDuration,
  nextSequenceVersionFromExisting,
  normalizeSequenceEntryOrder,
  pickSequenceAsset,
  sequenceRuntime,
  sequenceSnapshot,
} from '../sequencePlanning';

describe('sequencePlanning', () => {
  it('clamps duration, transition duration, and custom camera speed safely', () => {
    expect(clampSequenceDuration(-10)).toBe(0.5);
    expect(clampSequenceDuration(3.46)).toBe(3.5);
    expect(clampSequenceDuration(99)).toBe(60);
    expect(clampTransitionDuration(-1)).toBe(0);
    expect(clampTransitionDuration(13)).toBe(10);
    expect(clampCameraSpeedMultiplier(0)).toBe(0.1);
    expect(clampCameraSpeedMultiplier(9)).toBe(4);
  });

  it('calculates runtime from enabled durations and holds without adding overlapping transitions', () => {
    const runtime = sequenceRuntime([
      { id: 'a', storySceneId: 'scene-a', orderIndex: 1, enabled: true, durationSeconds: 4, transitionDurationSeconds: 2 },
      { id: 'b', storySceneId: 'scene-b', orderIndex: 2, enabled: true, durationSeconds: 3.5, holdDurationSeconds: 1 },
      { id: 'c', storySceneId: 'scene-c', orderIndex: 3, enabled: false, durationSeconds: 10 },
    ]);
    expect(runtime.totalRuntimeSeconds).toBe(8.5);
    expect(runtime.activeShotCount).toBe(2);
    expect(runtime.totalShotCount).toBe(3);
    expect(runtime.averageShotLength).toBe(4.3);
    expect(runtime.transitionRule).toBe('overlap_transitions_do_not_add_runtime');
  });

  it('normalizes duplicate-safe sequence entry ordering by timeline entry id', () => {
    const ordered = normalizeSequenceEntryOrder(['entry-3', 'entry-1'], [
      { id: 'entry-1', storySceneId: 'scene-a', orderIndex: 1, enabled: true, durationSeconds: 4 },
      { id: 'entry-2', storySceneId: 'scene-b', orderIndex: 2, enabled: true, durationSeconds: 4 },
      { id: 'entry-3', storySceneId: 'scene-a', orderIndex: 3, enabled: true, durationSeconds: 4 },
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['entry-3', 'entry-1', 'entry-2']);
    expect(ordered.map((item) => item.orderIndex)).toEqual([1, 2, 3]);
  });

  it('selects eligible sequence assets without mutating storybook state', () => {
    const picked = pickSequenceAsset({
      id: 'scene-1',
      activeImageAssetId: 'active',
      imageUrl: 'legacy-url',
      assets: [
        { id: 'rejected', assetType: 'IMAGE', status: 'READY', assetUrl: 'bad', creativeStatus: 'REJECTED' },
        { id: 'active', assetType: 'IMAGE', status: 'READY', assetUrl: 'active', creativeStatus: 'DRAFT' },
        { id: 'approved', assetType: 'IMAGE', status: 'READY', assetUrl: 'approved', creativeStatus: 'APPROVED' },
        { id: 'deleted', assetType: 'IMAGE', status: 'READY', assetUrl: 'deleted', deletedAt: new Date() },
      ],
    }, 'APPROVED');
    expect(picked.asset?.id).toBe('approved');
    expect(picked.source).toBe('APPROVED');
  });

  it('builds deterministic Film Blueprint output including disabled entries', () => {
    const blueprint = buildFilmBlueprint({
      sequenceId: 'seq',
      version: 2,
      scenes: [
        { id: 'b', storySceneId: 'scene-b', orderIndex: 2, enabled: false, durationSeconds: 10, selectedAssetId: 'asset-b', cameraMovement: 'PAN_LEFT' },
        { id: 'a', storySceneId: 'scene-a', orderIndex: 1, enabled: true, durationSeconds: 3.5, selectedAssetId: 'asset-a', shotType: 'WIDE', transition: 'CUT' },
      ],
    });
    expect(blueprint.runtimeSeconds).toBe(3.5);
    expect(blueprint.shots.map((shot) => shot.sequenceSceneId)).toEqual(['a', 'b']);
    expect(blueprint.shots[0]).toMatchObject({
      storySceneId: 'scene-a',
      assetId: 'asset-a',
      order: 1,
      enabled: true,
      durationSeconds: 3.5,
      shotType: 'WIDE',
      transition: 'CUT',
    });
    expect(blueprint.shots[1].enabled).toBe(false);
  });

  it('creates immutable version snapshots that preserve planning fields', () => {
    const snapshot = sequenceSnapshot({ id: 'seq', title: 'Cut 1', currentVersionNumber: 1 }, [
      {
        id: 'entry-1',
        storySceneId: 'scene-1',
        orderIndex: 1,
        enabled: true,
        durationSeconds: 4,
        selectedAssetId: 'asset-1',
        shotType: 'CLOSE_UP',
        cameraMovement: 'PUSH_IN',
        cameraSpeed: 'SLOW',
        transition: 'CROSS_DISSOLVE',
        transitionDurationSeconds: 0.8,
        creativeNotes: 'Hold on the smile.',
      },
    ]);
    expect(snapshot.runtime.totalRuntimeSeconds).toBe(4);
    expect(snapshot.scenes[0]).toMatchObject({
      storySceneId: 'scene-1',
      selectedAssetId: 'asset-1',
      shotType: 'CLOSE_UP',
      cameraMovement: 'PUSH_IN',
      transitionDurationSeconds: 0.8,
      creativeNotes: 'Hold on the smile.',
    });
  });

  it('derives the next sequence version from the highest stored version', () => {
    expect(nextSequenceVersionFromExisting([])).toBe(1);
    expect(nextSequenceVersionFromExisting([
      { versionNumber: 1 },
      { versionNumber: 2 },
      { versionNumber: 1 },
      { versionNumber: null },
    ])).toBe(3);
  });
});
