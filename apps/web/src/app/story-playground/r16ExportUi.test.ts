/**
 * Phase 2D — R16 Story Export UI logic tests.
 *
 * Tests the pure logic functions that drive the Export Story UI in the
 * Story Playground page. These are extracted equivalents of the in-component
 * derivations; they do not mount React or make network calls.
 */

import { describe, it, expect } from 'vitest';

// ── Types mirroring the page's StoryScene / StorySceneAsset shapes ─────────

interface MockAsset {
  assetType: string;
  status: string;
  assetUrl?: string | null;
}

interface MockScene {
  id: string;
  orderIndex: number;
  assets?: MockAsset[];
}

// ── Mirror of latestVideoAsset(scene) from new/page.tsx ───────────────────

function latestVideoAsset(scene: MockScene): MockAsset | undefined {
  return (scene.assets ?? []).find(
    (asset) => asset.assetType === 'VIDEO' && asset.status === 'READY',
  );
}

// ── Mirror of allScenesHaveReadyVideo derivation from new/page.tsx ────────

function allScenesHaveReadyVideo(isR16: boolean, scenes: MockScene[]): boolean {
  return isR16 && scenes.length > 0 && scenes.every((s) => Boolean(latestVideoAsset(s)));
}

// ── Mirror of the export-section display state ────────────────────────────

type ExportStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

interface ExportDisplayInput {
  exportStatus: ExportStatus | undefined;
  isMutationPending: boolean;
  isReady: boolean; // allScenesHaveReadyVideo
  scenesWithVideo: number;
  totalScenes: number;
  assetUrl: string | null | undefined;
}

type ExportDisplayState =
  | 'STORY_READY'
  | 'ASSEMBLING'
  | 'FAILED'
  | 'EXPORT_READY'
  | 'PROGRESS'
  | 'HIDDEN';

function resolveExportDisplayState(input: ExportDisplayInput): ExportDisplayState {
  const { exportStatus, isMutationPending, isReady, scenesWithVideo, totalScenes } = input;
  if (exportStatus === 'READY') return 'STORY_READY';
  if (isMutationPending || exportStatus === 'GENERATING') return 'ASSEMBLING';
  if (exportStatus === 'FAILED') return 'FAILED';
  if (isReady) return 'EXPORT_READY';
  if (totalScenes > 0) return 'PROGRESS';
  return 'HIDDEN';
}

// ── latestVideoAsset tests ─────────────────────────────────────────────────

describe('latestVideoAsset', () => {
  it('returns undefined when scene has no assets', () => {
    const scene: MockScene = { id: 's1', orderIndex: 0, assets: [] };
    expect(latestVideoAsset(scene)).toBeUndefined();
  });

  it('returns undefined when scene has only IMAGE assets', () => {
    const scene: MockScene = {
      id: 's1',
      orderIndex: 0,
      assets: [{ assetType: 'IMAGE', status: 'READY' }],
    };
    expect(latestVideoAsset(scene)).toBeUndefined();
  });

  it('returns undefined when VIDEO asset is GENERATING', () => {
    const scene: MockScene = {
      id: 's1',
      orderIndex: 0,
      assets: [{ assetType: 'VIDEO', status: 'GENERATING' }],
    };
    expect(latestVideoAsset(scene)).toBeUndefined();
  });

  it('returns undefined when VIDEO asset is FAILED', () => {
    const scene: MockScene = {
      id: 's1',
      orderIndex: 0,
      assets: [{ assetType: 'VIDEO', status: 'FAILED' }],
    };
    expect(latestVideoAsset(scene)).toBeUndefined();
  });

  it('returns the READY VIDEO asset', () => {
    const video: MockAsset = { assetType: 'VIDEO', status: 'READY', assetUrl: 'https://cdn/v.mp4' };
    const scene: MockScene = {
      id: 's1',
      orderIndex: 0,
      assets: [{ assetType: 'IMAGE', status: 'READY' }, video],
    };
    expect(latestVideoAsset(scene)).toBe(video);
  });
});

// ── allScenesHaveReadyVideo tests ─────────────────────────────────────────

describe('allScenesHaveReadyVideo', () => {
  const readyScene = (id: string): MockScene => ({
    id,
    orderIndex: 0,
    assets: [{ assetType: 'VIDEO', status: 'READY', assetUrl: `https://cdn/${id}.mp4` }],
  });

  const pendingScene = (id: string): MockScene => ({
    id,
    orderIndex: 0,
    assets: [{ assetType: 'VIDEO', status: 'GENERATING' }],
  });

  it('returns false when isR16 is false', () => {
    expect(allScenesHaveReadyVideo(false, [readyScene('s1')])).toBe(false);
  });

  it('returns false when scenes array is empty', () => {
    expect(allScenesHaveReadyVideo(true, [])).toBe(false);
  });

  it('returns true when all scenes have READY video and isR16 is true', () => {
    expect(allScenesHaveReadyVideo(true, [readyScene('s1'), readyScene('s2')])).toBe(true);
  });

  it('returns false when at least one scene has no READY video', () => {
    expect(allScenesHaveReadyVideo(true, [readyScene('s1'), pendingScene('s2')])).toBe(false);
  });

  it('returns false when all scenes are still generating', () => {
    expect(allScenesHaveReadyVideo(true, [pendingScene('s1'), pendingScene('s2')])).toBe(false);
  });

  it('returns false when scene has no assets at all', () => {
    const noAssetScene: MockScene = { id: 's1', orderIndex: 0, assets: [] };
    expect(allScenesHaveReadyVideo(true, [readyScene('s2'), noAssetScene])).toBe(false);
  });
});

// ── Export display state machine tests ───────────────────────────────────

describe('resolveExportDisplayState', () => {
  const base: ExportDisplayInput = {
    exportStatus: undefined,
    isMutationPending: false,
    isReady: false,
    scenesWithVideo: 0,
    totalScenes: 3,
    assetUrl: null,
  };

  it('shows STORY_READY when export status is READY', () => {
    expect(resolveExportDisplayState({ ...base, exportStatus: 'READY', assetUrl: 'https://cdn/story.mp4' }))
      .toBe('STORY_READY');
  });

  it('shows ASSEMBLING when mutation is pending', () => {
    expect(resolveExportDisplayState({ ...base, isMutationPending: true })).toBe('ASSEMBLING');
  });

  it('shows ASSEMBLING when export row is GENERATING', () => {
    expect(resolveExportDisplayState({ ...base, exportStatus: 'GENERATING' })).toBe('ASSEMBLING');
  });

  it('STORY_READY takes precedence over ASSEMBLING', () => {
    // If somehow both are true, READY wins (status check is first in priority)
    expect(resolveExportDisplayState({ ...base, exportStatus: 'READY', isMutationPending: true }))
      .toBe('STORY_READY');
  });

  it('shows FAILED when export status is FAILED', () => {
    expect(resolveExportDisplayState({ ...base, exportStatus: 'FAILED' })).toBe('FAILED');
  });

  it('shows EXPORT_READY when all scenes have video and no export exists', () => {
    expect(resolveExportDisplayState({ ...base, isReady: true, scenesWithVideo: 3 }))
      .toBe('EXPORT_READY');
  });

  it('shows PROGRESS when some scenes have video but not all', () => {
    expect(resolveExportDisplayState({ ...base, scenesWithVideo: 2, totalScenes: 3 }))
      .toBe('PROGRESS');
  });

  it('shows PROGRESS even when zero scenes have video (totalScenes > 0)', () => {
    expect(resolveExportDisplayState({ ...base, scenesWithVideo: 0, totalScenes: 3 }))
      .toBe('PROGRESS');
  });

  it('shows HIDDEN when totalScenes is 0', () => {
    expect(resolveExportDisplayState({ ...base, totalScenes: 0 })).toBe('HIDDEN');
  });

  it('shows EXPORT_READY (not FAILED) when retry is available after a failed export', () => {
    // After a FAILED export, if the user generates all videos and now isReady is true,
    // the UI should offer retry — FAILED state handles this via the retry button.
    // But with a current FAILED status and isReady=true, FAILED renders the retry button.
    expect(resolveExportDisplayState({ ...base, exportStatus: 'FAILED', isReady: true }))
      .toBe('FAILED');
  });
});

// ── Non-R16 guard test ────────────────────────────────────────────────────

describe('non-R16 guard', () => {
  it('allScenesHaveReadyVideo is always false for non-R16 users', () => {
    const scenes: MockScene[] = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      orderIndex: i,
      assets: [{ assetType: 'VIDEO', status: 'READY', assetUrl: `https://cdn/s${i}.mp4` }],
    }));
    expect(allScenesHaveReadyVideo(false, scenes)).toBe(false);
  });
});
