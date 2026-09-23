/**
 * Raivstream 5.0 — Production adapter.
 *
 * Converts the SEMANTIC production plan into the shapes the EXISTING production
 * infrastructure consumes (productionStructurer's ProductionManifest +
 * sequencePlanning) — WITHOUT creating a competing manifest system and WITHOUT
 * calling an LLM. This is the seam Slice 3 (PRODUCE) plugs the generation
 * engine into.
 */

import type { CreativeProductionPlanState, PlanScene, PlanShot } from './plan';

export interface AdapterShot {
  shot_id: string;
  timeframe: string;
  camera_setup: string;
  action_description: string;
  video_prompt: string;
  transition_to_next: string;
}

export interface AdapterScene {
  scene_id: number;
  elevenlabs_narration: string;
  minimax_video_prompt: string;
  camera_motion: string;
  duration_sec: number;
  resolution: '768P' | '1080P';
  first_frame_image_url: string | null;
  shots?: AdapterShot[];
}

export interface AdapterManifest {
  title: string;
  logline: string;
  master_style: string;
  negative_prompt_suffix: string;
  characters: Record<string, string>;
  scenes: AdapterScene[];
}

function toSecondsLabel(startSeconds: number, endSeconds: number): string {
  const fmt = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return `${fmt(startSeconds)} - ${fmt(endSeconds)}`;
}

export function adaptPlanToManifest(
  plan: CreativeProductionPlanState,
  input: { title?: string | null; logline?: string | null },
): AdapterManifest {
  const scenes: AdapterScene[] = plan.scenes.map((scene: PlanScene) => {
    const timeline = plan.timeline.find((entry) => entry.sceneId === scene.sceneId);
    const shots: AdapterShot[] = scene.shots.map((shot: PlanShot, index: number) => ({
      shot_id: shot.shotId,
      timeframe: toSecondsLabel(
        (timeline?.startSeconds ?? 0) + scene.shots.slice(0, index).reduce((sum, s) => sum + s.durationSeconds, 0),
        (timeline?.startSeconds ?? 0) + scene.shots.slice(0, index + 1).reduce((sum, s) => sum + s.durationSeconds, 0),
      ),
      camera_setup: shot.camera ?? 'Steady cinematic',
      action_description: shot.description,
      video_prompt: `${shot.description}. ${shot.visualDirection ?? 'Cinematic live-action photorealism, shallow depth of field, natural color grade'}`,
      transition_to_next: index === scene.shots.length - 1 ? 'Scene cut.' : 'Flowing continuity.',
    }));
    return {
      scene_id: scene.order,
      elevenlabs_narration: scene.narration ?? '',
      minimax_video_prompt: `${scene.description}. ${scene.shots[0]?.visualDirection ?? 'Cinematic'}. Consistent with the master style and negative prompts.`,
      camera_motion: scene.shots[0]?.camera ?? 'Steady cinematic',
      duration_sec: Math.min(15, Math.max(5, scene.estimatedDurationSeconds)),
      resolution: '1080P',
      first_frame_image_url: null,
      shots,
    };
  });

  return {
    title: input.title ?? 'Untitled project',
    logline: input.logline ?? '',
    master_style: 'Cinematic live-action photorealism, 35mm film look, realistic lighting, shallow depth of field, natural color grading',
    negative_prompt_suffix: '2d, animation, cartoon, illustration, anime, 3d render, low quality, morphing',
    characters: {},
    scenes,
  };
}