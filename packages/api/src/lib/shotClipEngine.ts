/**
 * Phase 17 — multi-clip shot engine (slice 1): turns a ProductionManifest
 * scene's 5–6s `shots[]` grid into an ordered, chain-ready clip plan. Each
 * clip is generated via MiniMax H3 I2V with the previous clip's LAST frame as
 * its opening frame (I2V chain continuity) and the Master Visual Bible locked
 * onto every prompt.
 *
 * Pure helpers here (unit-testable); the execution loop lives in the router.
 */

import type { ProductionScene, ProductionSceneShot } from './productionStructurer';

export interface ShotClipPlanEntry {
  shotIndex: number;
  shotId: string;
  timeframe: string;
  cameraSetup: string;
  actionDescription: string;
  videoPrompt: string;
  transitionToNext: string;
  /** H3 clips run 4–15s; the grid divides the scene's duration across its shots. */
  durationSeconds: number;
}

export function clampShotDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return 5;
  return Math.max(4, Math.min(15, Math.round(seconds)));
}

/**
 * Build the ordered clip plan from a manifest scene's `shots[]`.
 * Returns [] when the scene has no shot grid (single-clip flow stays as-is).
 */
export function buildShotClipPlan(scene: Pick<ProductionScene, 'duration_sec' | 'shots'> | undefined | null): ShotClipPlanEntry[] {
  const shots: ProductionSceneShot[] | undefined = scene?.shots;
  if (!shots?.length) return [];
  const perShot = clampShotDuration((scene?.duration_sec ?? shots.length * 5) / shots.length);
  return shots.map((shot, index) => ({
    shotIndex: index,
    shotId: shot.shot_id || `SHOT_${index + 1}`,
    timeframe: shot.timeframe,
    cameraSetup: shot.camera_setup,
    actionDescription: shot.action_description,
    videoPrompt: shot.video_prompt,
    transitionToNext: shot.transition_to_next,
    durationSeconds: perShot,
  }));
}