/**
 * Phase 3 — Homer First-Frame Animatic types.
 * Scene plan derived from HomerStoryState.beats; one frame per scene.
 */

export interface HomerAnimaticScene {
  id: string;
  ordinal: number;
  label: string;
  description: string;
  function: string;           // narrative function e.g. "setup" | "confrontation" | "climax"
  emotionalDirection: string;
  charactersInvolved: string[];
  locationsInvolved: string[];
  structuralPosition: 'act1' | 'rising' | 'climax' | 'falling' | 'resolution';
}

export type AnimaticFrameStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

export interface AnimaticFrame {
  id: string;
  sceneIndex: number;
  sceneId: string;
  sceneLabel: string;
  beatId?: string;
  visualPrompt: string;
  status: AnimaticFrameStatus;
  imageUrl?: string;
  directorNote?: string;
}

export interface HomerAnimaticState {
  animaticId: string;
  scenes: HomerAnimaticScene[];
  frames: AnimaticFrame[];
  overallStatus: AnimaticFrameStatus;
}
