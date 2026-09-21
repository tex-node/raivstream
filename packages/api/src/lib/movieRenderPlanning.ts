import crypto from 'node:crypto';
import type { FilmBlueprint } from './sequencePlanning';

export const MOVIE_RENDERER_VERSION = 'phase-10-v1';
export const MOVIE_RENDER_FEATURE_KEY = 'story:movie_render';
export const MOVIE_RENDER_DURATION_TOLERANCE_SECONDS = 0.25;
export const MOVIE_RENDER_DEFAULTS = {
  width: 720,
  height: 1280,
  fps: 30,
  container: 'mp4',
  videoCodec: 'libx264',
  pixelFormat: 'yuv420p',
} as const;

export const ACTIVE_MOVIE_RENDER_STATUSES = [
  'QUEUED',
  'PREPARING',
  'RENDERING_SHOTS',
  'ASSEMBLING',
  'ENCODING',
  'VERIFYING',
  'UPLOADING',
] as const;

export type MovieRenderAsset = {
  id: string;
  sceneId: string;
  assetUrl?: string | null;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  creativeStatus?: string | null;
  moderationStatus?: string | null;
  status?: string | null;
  assetType?: string | null;
  deletedAt?: Date | string | null;
};

export type MovieRenderPlanShot = {
  order: number;
  sequenceSceneId: string;
  storySceneId: string;
  assetId: string;
  /** IMAGE = still rendered for the shot duration; VIDEO = scene clip (Phase 10).
   * Optional for backward compatibility with plans persisted before Phase 10. */
  sourceType?: 'IMAGE' | 'VIDEO';
  sourceUrl: string;
  durationSeconds: number;
  renderDurationSeconds: number;
  transition: string;
  transitionDurationSeconds: number;
  holdDurationSeconds: number;
  shotType: string;
  cameraMovement: string;
  cameraSpeed: string;
  cameraSpeedMultiplier: number;
  zoom: number;
};

export type MovieRenderPlan = {
  rendererVersion: string;
  output: typeof MOVIE_RENDER_DEFAULTS;
  runtimeSeconds: number;
  transitionRule: FilmBlueprint['transitionRule'];
  shots: MovieRenderPlanShot[];
  warnings: string[];
};

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

export function hashRenderPlan(plan: MovieRenderPlan): string {
  return crypto.createHash('sha256').update(stableStringify(plan)).digest('hex');
}

export function isEligibleMovieRenderAsset(asset: MovieRenderAsset | null | undefined) {
  return Boolean(
    asset
    && asset.assetType === 'IMAGE'
    && asset.status === 'READY'
    && (asset.assetUrl || asset.thumbnailUrl)
    && !asset.deletedAt
    && asset.creativeStatus !== 'REJECTED'
    && asset.moderationStatus !== 'REJECTED',
  );
}

/** A READY scene video asset may stand in for the still image (Phase 10). */
export function isEligibleMovieRenderVideoAsset(asset: MovieRenderAsset | null | undefined) {
  return Boolean(
    asset
    && asset.assetType === 'VIDEO'
    && asset.status === 'READY'
    && asset.assetUrl
    && !asset.deletedAt
    && asset.creativeStatus !== 'REJECTED',
  );
}

function numberOrFallback(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanTransition(transition: string | null | undefined, order: number) {
  if (order <= 1) return 'NONE';
  const value = (transition || 'CUT').toUpperCase();
  if (['CROSS_DISSOLVE', 'FADE', 'DIP_TO_BLACK', 'DIP_TO_WHITE'].includes(value)) return value;
  return value === 'NONE' ? 'NONE' : 'CUT';
}

export function isOverlappingRenderedTransition(transition: string) {
  return ['CROSS_DISSOLVE', 'FADE', 'DIP_TO_BLACK', 'DIP_TO_WHITE'].includes(transition);
}

export function calculateExpectedRenderDuration(shots: Array<{ durationSeconds: number }>) {
  return Math.round(shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) * 1000) / 1000;
}

export function calculateRenderedSegmentDuration(input: { durationSeconds: number; transition: string; transitionDurationSeconds: number }) {
  return input.durationSeconds + (isOverlappingRenderedTransition(input.transition) ? input.transitionDurationSeconds : 0);
}

export function durationWithinTolerance(input: { expectedSeconds: number; actualSeconds: number; toleranceSeconds?: number }) {
  const toleranceSeconds = input.toleranceSeconds ?? MOVIE_RENDER_DURATION_TOLERANCE_SECONDS;
  const durationDeltaSeconds = Math.abs(input.actualSeconds - input.expectedSeconds);
  return {
    expectedDurationSeconds: input.expectedSeconds,
    actualDurationSeconds: input.actualSeconds,
    durationDeltaSeconds,
    toleranceSeconds,
    ok: durationDeltaSeconds <= toleranceSeconds,
  };
}

export function buildMovieRenderPlan(input: {
  filmBlueprint: FilmBlueprint;
  assetsById: Map<string, MovieRenderAsset>;
  /** Optional per-scene READY video assets — preferred over stills when present. */
  videoAssetsBySceneId?: Map<string, MovieRenderAsset>;
}): MovieRenderPlan {
  const warnings: string[] = [];
  const enabledShots = input.filmBlueprint.shots
    .filter((shot) => shot.enabled)
    .sort((a, b) => a.order - b.order);

  const shots = enabledShots.map((shot, index): MovieRenderPlanShot => {
    const videoAsset = input.videoAssetsBySceneId?.get(shot.storySceneId);
    const useVideo = isEligibleMovieRenderVideoAsset(videoAsset);
    const imageAsset = shot.assetId ? input.assetsById.get(shot.assetId) : undefined;
    if (!useVideo) {
      if (!shot.assetId) throw new Error(`Shot ${shot.order} has no selected image asset.`);
      if (!isEligibleMovieRenderAsset(imageAsset)) throw new Error(`Shot ${shot.order} uses an ineligible image asset.`);
    }
    const sourceType: 'IMAGE' | 'VIDEO' = useVideo ? 'VIDEO' : 'IMAGE';
    const sourceUrl = useVideo
      ? (videoAsset!.assetUrl || '')
      : (imageAsset!.assetUrl || imageAsset!.thumbnailUrl || '');
    const assetId = useVideo ? videoAsset!.id : imageAsset!.id;
    const transition = cleanTransition(shot.transition, index + 1);
    const transitionDurationSeconds = transition === 'CUT' || transition === 'NONE'
      ? 0
      : Math.min(Math.max(numberOrFallback(shot.transitionDurationSeconds, 0.6), 0.2), 2);
    if (transition !== shot.transition && shot.transition) {
      warnings.push(`Shot ${shot.order} transition ${shot.transition} renders as ${transition}.`);
    }

    const durationSeconds = Math.max(0.5, numberOrFallback(shot.durationSeconds, 4) + Math.max(0, numberOrFallback(shot.holdDurationSeconds, 0)));
    const renderedTransition = transition;
    const renderedTransitionDurationSeconds = transitionDurationSeconds;
    return {
      order: shot.order,
      sequenceSceneId: shot.sequenceSceneId,
      storySceneId: shot.storySceneId,
      assetId,
      sourceType,
      sourceUrl,
      durationSeconds,
      renderDurationSeconds: calculateRenderedSegmentDuration({
        durationSeconds,
        transition: renderedTransition,
        transitionDurationSeconds: renderedTransitionDurationSeconds,
      }),
      transition: renderedTransition,
      transitionDurationSeconds: renderedTransitionDurationSeconds,
      holdDurationSeconds: Math.max(0, numberOrFallback(shot.holdDurationSeconds, 0)),
      shotType: shot.shotType || 'MEDIUM',
      cameraMovement: shot.cameraMovement || 'STATIC',
      cameraSpeed: shot.cameraSpeed || 'NORMAL',
      cameraSpeedMultiplier: Math.max(0.1, numberOrFallback(shot.cameraSpeedMultiplier, 1)),
      zoom: Math.max(1, numberOrFallback(shot.zoom, 1)),
    };
  });

  if (shots.length === 0) throw new Error('Enable at least one shot before rendering a movie.');

  return {
    rendererVersion: MOVIE_RENDERER_VERSION,
    output: MOVIE_RENDER_DEFAULTS,
    runtimeSeconds: Math.round(shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) * 10) / 10,
    transitionRule: input.filmBlueprint.transitionRule,
    shots,
    warnings,
  };
}

export function renderReadiness(plan: MovieRenderPlan) {
  return {
    ready: plan.shots.length > 0 && plan.shots.every((shot) => Boolean(shot.assetId && shot.sourceUrl)),
    shotCount: plan.shots.length,
    runtimeSeconds: plan.runtimeSeconds,
    warnings: plan.warnings,
  };
}

export function shouldReuseMovieRenderJob(existing: { renderPlanHash: string; status: string } | null | undefined, renderPlanHash: string) {
  if (!existing || existing.renderPlanHash !== renderPlanHash) return false;
  return [...ACTIVE_MOVIE_RENDER_STATUSES, 'READY'].includes(existing.status as any);
}
