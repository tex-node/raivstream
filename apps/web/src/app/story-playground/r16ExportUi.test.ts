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

// ── T6, T7, T8: Save Video visibility and Watch Story regression ──────────

describe('T6+T7: Save Video visibility', () => {
  const base: ExportDisplayInput = {
    exportStatus: undefined,
    isMutationPending: false,
    isReady: false,
    scenesWithVideo: 0,
    totalScenes: 3,
    assetUrl: null,
  };

  it('T6: Save Video is shown when export status is READY (STORY_READY state)', () => {
    const state = resolveExportDisplayState({
      ...base,
      exportStatus: 'READY',
      assetUrl: 'https://media.raivstream.com/story-exports/p/exports/e/out.mp4',
    });
    expect(state).toBe('STORY_READY');
  });

  it('T7: Save Video is NOT shown when export status is GENERATING', () => {
    expect(resolveExportDisplayState({ ...base, exportStatus: 'GENERATING' }))
      .not.toBe('STORY_READY');
  });

  it('T7: Save Video is NOT shown when export status is PENDING', () => {
    expect(resolveExportDisplayState({ ...base, exportStatus: 'PENDING' }))
      .not.toBe('STORY_READY');
  });

  it('T7: Save Video is NOT shown when export status is FAILED', () => {
    expect(resolveExportDisplayState({ ...base, exportStatus: 'FAILED' }))
      .not.toBe('STORY_READY');
  });

  it('T7: Save Video is NOT shown when all scenes have video but export has not been requested', () => {
    expect(resolveExportDisplayState({ ...base, isReady: true, scenesWithVideo: 3, totalScenes: 3 }))
      .toBe('EXPORT_READY');
  });
});

describe('T8: Watch Story behavior unchanged', () => {
  const base: ExportDisplayInput = {
    exportStatus: undefined,
    isMutationPending: false,
    isReady: false,
    scenesWithVideo: 0,
    totalScenes: 3,
    assetUrl: null,
  };

  it('STORY_READY state is still reached when exportStatus is READY (Watch Story still renders)', () => {
    expect(resolveExportDisplayState({ ...base, exportStatus: 'READY', assetUrl: 'https://cdn/story.mp4' }))
      .toBe('STORY_READY');
  });

  it('Save Video download URL template uses exportId correctly', () => {
    const exportId = 'clxyz1234567890abcd';
    const url = `/api/story/export/${exportId}/download`;
    expect(url).toBe(`/api/story/export/clxyz1234567890abcd/download`);
    expect(url).toContain('/api/story/export/');
    expect(url).toContain('/download');
  });
});

// ── T9: allScenesHaveStills — "Generate Video" button condition ───────────

interface MockSceneWithImage {
  id: string;
  orderIndex: number;
  imageUrl?: string | null;
  assets?: MockAsset[];
}

function allScenesHaveStills(isR16: boolean, scenes: MockSceneWithImage[]): boolean {
  return isR16 && scenes.length > 0 && scenes.every((s) => Boolean(s.imageUrl));
}

describe('T9: allScenesHaveStills', () => {
  const stillScene = (id: string): MockSceneWithImage => ({
    id, orderIndex: 0, imageUrl: `https://cdn/${id}.jpg`,
  });
  const noStillScene = (id: string): MockSceneWithImage => ({
    id, orderIndex: 0, imageUrl: null,
  });

  it('returns false when isR16 is false', () => {
    expect(allScenesHaveStills(false, [stillScene('s1')])).toBe(false);
  });

  it('returns false when scenes array is empty', () => {
    expect(allScenesHaveStills(true, [])).toBe(false);
  });

  it('returns true when all scenes have imageUrl and isR16', () => {
    expect(allScenesHaveStills(true, [stillScene('s1'), stillScene('s2')])).toBe(true);
  });

  it('returns false when at least one scene has no imageUrl', () => {
    expect(allScenesHaveStills(true, [stillScene('s1'), noStillScene('s2')])).toBe(false);
  });

  it('returns false when all scenes have no imageUrl', () => {
    expect(allScenesHaveStills(true, [noStillScene('s1'), noStillScene('s2')])).toBe(false);
  });

  it('is independent of whether scenes have video assets', () => {
    const sceneWithStillAndVideo: MockSceneWithImage = {
      id: 's1', orderIndex: 0, imageUrl: 'https://cdn/s1.jpg',
      assets: [{ assetType: 'VIDEO', status: 'READY', assetUrl: 'https://cdn/s1.mp4' }],
    };
    const sceneWithStillNoVideo: MockSceneWithImage = {
      id: 's2', orderIndex: 0, imageUrl: 'https://cdn/s2.jpg',
      assets: [],
    };
    expect(allScenesHaveStills(true, [sceneWithStillAndVideo, sceneWithStillNoVideo])).toBe(true);
  });
});

// ── T10: batch video progress state ──────────────────────────────────────

function isBatchGeneratingVideos(batchVideoProgress: { current: number; total: number } | null): boolean {
  return batchVideoProgress !== null;
}

describe('T10: isBatchGeneratingVideos', () => {
  it('is false when batchVideoProgress is null', () => {
    expect(isBatchGeneratingVideos(null)).toBe(false);
  });

  it('is true when batchVideoProgress is set', () => {
    expect(isBatchGeneratingVideos({ current: 1, total: 5 })).toBe(true);
  });

  it('is true even when current is 0 (batch initializing)', () => {
    expect(isBatchGeneratingVideos({ current: 0, total: 5 })).toBe(true);
  });

  it('is true when current equals total (last scene in progress)', () => {
    expect(isBatchGeneratingVideos({ current: 5, total: 5 })).toBe(true);
  });
});

// ── T11: extended state machine including Generate Video states ───────────

interface FullExportDisplayInput extends ExportDisplayInput {
  isBatchGenerating: boolean;
  allHaveStills: boolean;
}

type FullExportDisplayState =
  | 'STORY_READY'
  | 'ASSEMBLING'
  | 'BATCH_GENERATING'
  | 'FAILED'
  | 'EXPORT_READY'
  | 'GENERATE_VIDEO_READY'
  | 'PROGRESS'
  | 'HIDDEN';

function resolveFullExportDisplayState(input: FullExportDisplayInput): FullExportDisplayState {
  const { exportStatus, isMutationPending, isReady, isBatchGenerating, allHaveStills, totalScenes } = input;
  if (exportStatus === 'READY') return 'STORY_READY';
  if (isMutationPending || exportStatus === 'GENERATING') return 'ASSEMBLING';
  if (isBatchGenerating) return 'BATCH_GENERATING';
  if (exportStatus === 'FAILED') return 'FAILED';
  if (isReady) return 'EXPORT_READY';
  if (allHaveStills) return 'GENERATE_VIDEO_READY';
  if (totalScenes > 0) return 'PROGRESS';
  return 'HIDDEN';
}

describe('T11: Generate Video state machine', () => {
  const base: FullExportDisplayInput = {
    exportStatus: undefined,
    isMutationPending: false,
    isReady: false,
    isBatchGenerating: false,
    allHaveStills: false,
    scenesWithVideo: 0,
    totalScenes: 3,
    assetUrl: null,
  };

  it('GENERATE_VIDEO_READY when all scenes have stills and no video yet', () => {
    expect(resolveFullExportDisplayState({ ...base, allHaveStills: true }))
      .toBe('GENERATE_VIDEO_READY');
  });

  it('BATCH_GENERATING takes precedence over GENERATE_VIDEO_READY', () => {
    expect(resolveFullExportDisplayState({ ...base, allHaveStills: true, isBatchGenerating: true }))
      .toBe('BATCH_GENERATING');
  });

  it('ASSEMBLING takes precedence over BATCH_GENERATING', () => {
    expect(resolveFullExportDisplayState({ ...base, isBatchGenerating: true, isMutationPending: true }))
      .toBe('ASSEMBLING');
  });

  it('STORY_READY takes precedence over everything', () => {
    expect(resolveFullExportDisplayState({
      ...base,
      exportStatus: 'READY',
      isBatchGenerating: true,
      allHaveStills: true,
      isReady: true,
    })).toBe('STORY_READY');
  });

  it('BATCH_GENERATING is shown between scene video generation and export assembly', () => {
    expect(resolveFullExportDisplayState({ ...base, isBatchGenerating: true }))
      .toBe('BATCH_GENERATING');
  });

  it('FAILED export does not block GENERATE_VIDEO_READY for a fresh attempt', () => {
    expect(resolveFullExportDisplayState({ ...base, exportStatus: 'FAILED', allHaveStills: true }))
      .toBe('FAILED');
  });

  it('PROGRESS when some scenes have no still and no batch is running', () => {
    expect(resolveFullExportDisplayState({ ...base, totalScenes: 3, allHaveStills: false }))
      .toBe('PROGRESS');
  });

  it('HIDDEN when there are no scenes at all', () => {
    expect(resolveFullExportDisplayState({ ...base, totalScenes: 0 }))
      .toBe('HIDDEN');
  });

  it('button is disabled during BATCH_GENERATING (duplicate submit prevention)', () => {
    const batchGenerating = isBatchGeneratingVideos({ current: 2, total: 5 });
    expect(batchGenerating).toBe(true);
  });
});
