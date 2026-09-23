/**
 * Raivstream 5.0 — Preview builder.
 *
 * Preview exists BEFORE expensive final generation. It answers "is this what I
 * meant?" — story structure, characters, worlds, keyframes (placeholder),
 * rough timing, narration, and visual/audio direction. Preview must be cheap:
 * text + references, no media generation.
 */

import type { CreativeBibleState } from '../shared/types';
import type { CreativeProductionPlanState } from './plan';

export interface PreviewState {
  structure: string;
  runtimeSeconds: number;
  scenes: Array<{
    sceneId: string;
    title: string;
    beat: string;
    description: string;
    narration: string;
    visualDirection: string;
    audioDirection: string;
    estimatedDurationSeconds: number;
    shotCount: number;
    keyframe: null; // media keyframes arrive in the PRODUCE slice
  }>;
  characters: Array<Record<string, unknown>>;
  worlds: Array<Record<string, unknown>>;
  visualLanguage?: Record<string, unknown>;
  audioLanguage?: Record<string, unknown>;
  notes: string[];
}

export function buildPreview(plan: CreativeProductionPlanState, bible?: CreativeBibleState | null): PreviewState {
  return {
    structure: plan.structure ?? 'Linear',
    runtimeSeconds: plan.totalRuntimeSeconds,
    scenes: plan.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      title: scene.title,
      beat: scene.beat,
      description: scene.description,
      narration: scene.narration ?? '',
      visualDirection: scene.shots[0]?.visualDirection ?? 'cinematic',
      audioDirection: scene.shots[0]?.audioDirection ?? 'layered',
      estimatedDurationSeconds: scene.estimatedDurationSeconds,
      shotCount: scene.shots.length,
      keyframe: null,
    })),
    characters: (bible?.characters ?? []) as Array<Record<string, unknown>>,
    worlds: (bible?.worlds ?? []) as Array<Record<string, unknown>>,
    visualLanguage: bible?.visualLanguage,
    audioLanguage: bible?.audioLanguage,
    notes: plan.notes,
  };
}