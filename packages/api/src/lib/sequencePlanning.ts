export const SEQUENCE_SHOT_TYPES = [
  'EXTREME_WIDE',
  'WIDE',
  'MEDIUM_WIDE',
  'MEDIUM',
  'MEDIUM_CLOSE_UP',
  'CLOSE_UP',
  'EXTREME_CLOSE_UP',
  'POV',
  'OVER_THE_SHOULDER',
  'HIGH_ANGLE',
  'LOW_ANGLE',
  'TRACKING',
] as const;

export const SEQUENCE_CAMERA_MOVEMENTS = [
  'NONE',
  'STATIC',
  'PAN_LEFT',
  'PAN_RIGHT',
  'TILT_UP',
  'TILT_DOWN',
  'PUSH_IN',
  'PULL_OUT',
  'TRACK_LEFT',
  'TRACK_RIGHT',
  'ORBIT',
  'DOLLY',
  'CRANE',
  'HANDHELD',
] as const;

export const SEQUENCE_CAMERA_SPEEDS = ['SLOW', 'NORMAL', 'FAST', 'CUSTOM'] as const;

export const SEQUENCE_TRANSITIONS = [
  'CUT',
  'CROSS_DISSOLVE',
  'FADE',
  'DIP_TO_BLACK',
  'DIP_TO_WHITE',
  'MATCH_CUT',
  'WIPE',
  'NONE',
] as const;

export type SequenceShotType = (typeof SEQUENCE_SHOT_TYPES)[number];
export type SequenceCameraMovement = (typeof SEQUENCE_CAMERA_MOVEMENTS)[number];
export type SequenceCameraSpeed = (typeof SEQUENCE_CAMERA_SPEEDS)[number];
export type SequenceTransitionType = (typeof SEQUENCE_TRANSITIONS)[number];

export type SequenceSceneLike = {
  id: string;
  storySceneId?: string | null;
  sceneId?: string | null;
  orderIndex: number;
  enabled: boolean;
  durationSeconds: number | null;
  selectedAssetId?: string | null;
  shotType?: string | null;
  cameraMovement?: string | null;
  cameraSpeed?: string | null;
  cameraSpeedMultiplier?: number | null;
  transition?: string | null;
  transitionDurationSeconds?: number | null;
  holdDurationSeconds?: number | null;
  zoom?: number | null;
  creativeNotes?: string | null;
};

export type SequenceAssetCandidate = {
  id: string;
  sceneId?: string | null;
  storySceneId?: string | null;
  assetType?: string | null;
  status?: string | null;
  assetUrl?: string | null;
  thumbnailUrl?: string | null;
  creativeStatus?: string | null;
  moderationStatus?: string | null;
  deletedAt?: Date | string | null;
  isLatest?: boolean | null;
  isFavorite?: boolean | null;
};

export type SequenceSceneSeedLike = {
  id: string;
  activeImageAssetId?: string | null;
  imageUrl?: string | null;
  assets?: SequenceAssetCandidate[];
};

export type SequenceAssetPreference = 'ACTIVE' | 'APPROVED' | 'FAVORITE' | 'LATEST' | 'LEGACY';

export type FilmBlueprint = {
  sequenceId: string;
  version: number;
  runtimeSeconds: number;
  transitionRule: 'overlap_transitions_do_not_add_runtime';
  shots: Array<{
    sequenceSceneId: string;
    storySceneId: string;
    assetId: string | null;
    order: number;
    enabled: boolean;
    durationSeconds: number;
    shotType: string | null;
    cameraMovement: string | null;
    cameraSpeed: string | null;
    cameraSpeedMultiplier: number | null;
    transition: string | null;
    transitionDurationSeconds: number | null;
    holdDurationSeconds: number | null;
    zoom: number | null;
  }>;
};

export function clampSequenceDuration(value: unknown, fallback = 4) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.min(60, Math.max(0.5, numeric)) * 10) / 10;
}

export function clampTransitionDuration(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(Math.min(10, Math.max(0, numeric)) * 10) / 10;
}

export function clampCameraSpeedMultiplier(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(Math.min(4, Math.max(0.1, numeric)) * 10) / 10;
}

export function eligibleSequenceAsset(asset: SequenceAssetCandidate) {
  return asset.assetType === 'IMAGE'
    && asset.status === 'READY'
    && Boolean(asset.assetUrl || asset.thumbnailUrl)
    && !asset.deletedAt
    && asset.moderationStatus !== 'REJECTED'
    && asset.creativeStatus !== 'REJECTED';
}

export function pickSequenceAsset(scene: SequenceSceneSeedLike, preference: SequenceAssetPreference = 'ACTIVE') {
  const assets = (scene.assets ?? []).filter(eligibleSequenceAsset);
  const active = assets.find((asset) => asset.id === scene.activeImageAssetId) ?? null;
  const approved = assets.find((asset) => asset.creativeStatus === 'APPROVED') ?? null;
  const favorite = assets.find((asset) => asset.isFavorite) ?? null;
  const latest = assets.find((asset) => asset.isLatest) ?? assets[0] ?? null;
  const legacy = scene.imageUrl ? { id: 'legacy', assetUrl: scene.imageUrl } : null;

  const selected = preference === 'APPROVED'
    ? approved ?? active ?? favorite ?? latest
    : preference === 'FAVORITE'
      ? favorite ?? approved ?? active ?? latest
      : preference === 'LATEST'
        ? latest ?? approved ?? active ?? favorite
        : preference === 'LEGACY'
          ? null
          : active ?? approved ?? favorite ?? latest;

  return {
    asset: selected ?? null,
    legacyImageUrl: selected ? null : legacy?.assetUrl ?? null,
    source: selected
      ? selected.id === active?.id
        ? 'ACTIVE'
        : selected.id === approved?.id
          ? 'APPROVED'
          : selected.id === favorite?.id
            ? 'FAVORITE'
            : 'LATEST'
      : legacy
        ? 'LEGACY'
        : 'PLACEHOLDER',
  };
}

export function sequenceRuntime(scenes: SequenceSceneLike[]) {
  const enabledScenes = scenes.filter((scene) => scene.enabled);
  const totalRuntimeSeconds = Math.round(enabledScenes.reduce((sum, scene) => {
    const duration = clampSequenceDuration(scene.durationSeconds);
    const hold = Math.max(0, clampTransitionDuration(scene.holdDurationSeconds) ?? 0);
    return sum + duration + hold;
  }, 0) * 10) / 10;

  return {
    totalRuntimeSeconds,
    activeShotCount: enabledScenes.length,
    sceneCount: enabledScenes.length,
    totalShotCount: scenes.length,
    averageShotLength: enabledScenes.length ? Math.round((totalRuntimeSeconds / enabledScenes.length) * 10) / 10 : 0,
    transitionRule: 'overlap_transitions_do_not_add_runtime' as const,
  };
}

export function normalizeSequenceEntryOrder(entryIds: string[], currentScenes: SequenceSceneLike[]) {
  const byId = new Map(currentScenes.map((scene) => [scene.id, scene]));
  const seen = new Set<string>();
  const ordered: SequenceSceneLike[] = [];

  for (const id of entryIds) {
    const scene = byId.get(id);
    if (!scene || seen.has(id)) continue;
    ordered.push(scene);
    seen.add(id);
  }

  for (const scene of [...currentScenes].sort((a, b) => a.orderIndex - b.orderIndex)) {
    if (!seen.has(scene.id)) ordered.push(scene);
  }

  return ordered.map((scene, index) => ({ ...scene, orderIndex: index + 1 }));
}

export function buildFilmBlueprint(input: {
  sequenceId: string;
  version: number;
  scenes: SequenceSceneLike[];
}): FilmBlueprint {
  const ordered = [...input.scenes].sort((a, b) => a.orderIndex - b.orderIndex);
  const runtime = sequenceRuntime(ordered);
  return {
    sequenceId: input.sequenceId,
    version: input.version,
    runtimeSeconds: runtime.totalRuntimeSeconds,
    transitionRule: runtime.transitionRule,
    shots: ordered.map((scene, index) => ({
      sequenceSceneId: scene.id,
      storySceneId: scene.storySceneId ?? scene.sceneId ?? '',
      assetId: scene.selectedAssetId ?? null,
      order: index + 1,
      enabled: scene.enabled,
      durationSeconds: clampSequenceDuration(scene.durationSeconds),
      shotType: scene.shotType ?? null,
      cameraMovement: scene.cameraMovement ?? null,
      cameraSpeed: scene.cameraSpeed ?? null,
      cameraSpeedMultiplier: scene.cameraSpeedMultiplier ?? null,
      transition: scene.transition ?? null,
      transitionDurationSeconds: clampTransitionDuration(scene.transitionDurationSeconds),
      holdDurationSeconds: clampTransitionDuration(scene.holdDurationSeconds),
      zoom: scene.zoom ?? null,
    })),
  };
}

/**
 * Canonical finished-film timeline positions for each enabled shot.
 *
 * This is the single source of truth for "what second of the finished film
 * does shot N start at" — used by the Audio & Performance layer (Phase 9B.2)
 * to anchor cues. It is deliberately NOT derived from FFmpeg render/xfade
 * handles: `calculateRenderedSegmentDuration` in movieRenderPlanning.ts adds
 * transition-overlap time for the *encoder's* benefit only, and must never
 * leak into audio cue timing. The canonical rule (transitionRule:
 * 'overlap_transitions_do_not_add_runtime') is that each shot occupies
 * exactly `durationSeconds + holdDurationSeconds` of canonical screen time,
 * back to back, matching sequenceRuntime()'s own sum exactly.
 */
export type CanonicalShotTimelineEntry = {
  sequenceSceneId: string;
  storySceneId: string;
  order: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  screenTimeSeconds: number;
};

export function computeCanonicalShotTimeline(filmBlueprint: Pick<FilmBlueprint, 'shots'>): CanonicalShotTimelineEntry[] {
  const enabledShots = filmBlueprint.shots
    .filter((shot) => shot.enabled)
    .slice()
    .sort((a, b) => a.order - b.order);

  let cursor = 0;
  return enabledShots.map((shot) => {
    const screenTimeSeconds = Math.round((shot.durationSeconds + Math.max(0, shot.holdDurationSeconds ?? 0)) * 1000) / 1000;
    const startTimeSeconds = Math.round(cursor * 1000) / 1000;
    const endTimeSeconds = Math.round((cursor + screenTimeSeconds) * 1000) / 1000;
    cursor += screenTimeSeconds;
    return {
      sequenceSceneId: shot.sequenceSceneId,
      storySceneId: shot.storySceneId,
      order: shot.order,
      startTimeSeconds,
      endTimeSeconds,
      screenTimeSeconds,
    };
  });
}

export function nextSequenceVersionFromExisting(versions: Array<{ versionNumber?: number | null }>) {
  const maxVersion = versions.reduce((max, version) => {
    const numeric = Number(version.versionNumber);
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);
  return maxVersion + 1;
}

export function sequenceSnapshot(input: {
  id: string;
  title: string;
  status?: string | null;
  currentVersionNumber: number;
}, scenes: SequenceSceneLike[]) {
  const ordered = [...scenes].sort((a, b) => a.orderIndex - b.orderIndex);
  const runtime = sequenceRuntime(ordered);
  return {
    sequence: {
      id: input.id,
      title: input.title,
      status: input.status ?? 'DRAFT',
      currentVersionNumber: input.currentVersionNumber,
    },
    runtime,
    scenes: ordered.map((scene, index) => ({
      id: scene.id,
      storySceneId: scene.storySceneId ?? scene.sceneId ?? null,
      orderIndex: index + 1,
      enabled: scene.enabled,
      durationSeconds: clampSequenceDuration(scene.durationSeconds),
      selectedAssetId: scene.selectedAssetId ?? null,
      shotType: scene.shotType ?? null,
      cameraMovement: scene.cameraMovement ?? null,
      cameraSpeed: scene.cameraSpeed ?? null,
      cameraSpeedMultiplier: scene.cameraSpeedMultiplier ?? null,
      transition: scene.transition ?? null,
      transitionDurationSeconds: clampTransitionDuration(scene.transitionDurationSeconds),
      holdDurationSeconds: clampTransitionDuration(scene.holdDurationSeconds),
      zoom: scene.zoom ?? null,
      creativeNotes: scene.creativeNotes ?? null,
    })),
  };
}
