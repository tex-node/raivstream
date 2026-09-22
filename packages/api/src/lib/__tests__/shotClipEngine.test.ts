import { describe, it, expect } from 'vitest';
import { buildShotClipPlan, clampShotDuration } from '../shotClipEngine';
import type { ProductionScene } from '../productionStructurer';

const SCENE_20S: ProductionScene = {
  scene_id: 1,
  elevenlabs_narration: 'narr',
  minimax_video_prompt: 'fallback prompt',
  camera_motion: 'Tracking Shot',
  duration_sec: 20,
  resolution: '1080P',
  first_frame_image_url: null,
  shots: [
    { shot_id: 'SCENE_01_SHOT_01', timeframe: '00:00 - 00:05', camera_setup: 'Medium Shot, Tracking Shot, Eye Level', action_description: 'walks', video_prompt: 'shot 1 prompt', transition_to_next: 'stops' },
    { shot_id: 'SCENE_01_SHOT_02', timeframe: '00:05 - 00:10', camera_setup: 'Close-Up, Static Hold', action_description: 'turns', video_prompt: 'shot 2 prompt', transition_to_next: 'looks' },
    { shot_id: 'SCENE_01_SHOT_03', timeframe: '00:10 - 00:15', camera_setup: 'Wide Shot, Whip Pan', action_description: 'runs', video_prompt: 'shot 3 prompt', transition_to_next: 'falls' },
    { shot_id: 'SCENE_01_SHOT_04', timeframe: '00:15 - 00:20', camera_setup: 'Extreme Close-Up, Rack Focus', action_description: 'gasps', video_prompt: 'shot 4 prompt', transition_to_next: 'cut' },
  ],
};

describe('shotClipEngine', () => {
  describe('clampShotDuration', () => {
    it('clamps into the H3 4–15s window', () => {
      expect(clampShotDuration(2)).toBe(4);
      expect(clampShotDuration(5)).toBe(5);
      expect(clampShotDuration(20)).toBe(15);
      expect(clampShotDuration(NaN)).toBe(5);
    });
  });

  describe('buildShotClipPlan', () => {
    it('returns [] when the scene has no shot grid', () => {
      expect(buildShotClipPlan(undefined)).toEqual([]);
      expect(buildShotClipPlan({ duration_sec: 6, shots: undefined })).toEqual([]);
      expect(buildShotClipPlan({ duration_sec: 6, shots: [] })).toEqual([]);
    });

    it('decomposes a 20s scene into 4 ordered 5s clips', () => {
      const plan = buildShotClipPlan(SCENE_20S);
      expect(plan).toHaveLength(4);
      expect(plan.map((entry) => entry.shotIndex)).toEqual([0, 1, 2, 3]);
      expect(plan[0].shotId).toBe('SCENE_01_SHOT_01');
      expect(plan[0].cameraSetup).toContain('Tracking Shot');
      expect(plan[0].videoPrompt).toBe('shot 1 prompt');
      expect(plan[0].transitionToNext).toBe('stops');
      expect(plan.every((entry) => entry.durationSeconds === 5)).toBe(true);
    });

    it('divides the scene duration across shots, clamped to 4–15s', () => {
      const plan = buildShotClipPlan({ ...SCENE_20S, duration_sec: 30, shots: SCENE_20S.shots });
      expect(plan[0].durationSeconds).toBe(8);
      const tiny = buildShotClipPlan({ ...SCENE_20S, duration_sec: 2, shots: SCENE_20S.shots });
      expect(tiny[0].durationSeconds).toBe(4);
    });
  });
});