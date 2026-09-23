import { describe, it, expect } from 'vitest';
import { buildCreativePlan } from '../production/plan';
import { buildPreview } from '../production/preview';
import { adaptPlanToManifest } from '../production/adapter';
import { interpret } from '../intent/interpreter';
import { buildSeedBible } from '../bible/service';
import { nextActionFor } from '../project/state';

describe('creative production plan', () => {
  it('builds a commercial plan with hook→product→benefit→CTA and auto shot breakdown', () => {
    const interpretation = interpret('Create a 60-second cinematic commercial for a new Nigerian premium skincare brand. Make it feel luxurious, confident and modern.');
    const bible = buildSeedBible(interpretation);
    const plan = buildCreativePlan({
      projectType: interpretation.projectType,
      brief: {
        originalIntent: interpretation.summary,
        objective: interpretation.inferred.objective,
        format: interpretation.explicit.format,
        durationSeconds: interpretation.explicit.durationSeconds,
      },
      bible,
    });
    expect(plan.scenes.length).toBe(4);
    expect(plan.scenes[0].title).toBe('The Hook');
    expect(plan.scenes.every((scene) => scene.shots.length > 0)).toBe(true);
    expect(plan.scenes.every((scene) => scene.shots.every((shot) => shot.durationSeconds >= 4 && shot.durationSeconds <= 6))).toBe(true);
    expect(plan.totalRuntimeSeconds).toBeGreaterThan(0);
    expect(plan.timeline.length).toBe(plan.scenes.length);
    expect(plan.timeline[0].startSeconds).toBe(0);
  });

  it('builds a story plan using the 4-act structure', () => {
    const interpretation = interpret('Create a 5-minute photorealistic short film about a young Nigerian woman returning home.');
    const plan = buildCreativePlan({ projectType: interpretation.projectType });
    expect(plan.structure).toContain('Setup');
    expect(plan.scenes.length).toBe(4);
  });

  it('builds an education plan', () => {
    const interpretation = interpret('Create a 3-minute lesson explaining photosynthesis to eight-year-olds.');
    const plan = buildCreativePlan({ projectType: interpretation.projectType });
    expect(plan.scenes.map((s) => s.title)).toContain('The Hook');
    expect(plan.scenes.map((s) => s.title)).toContain('Recap');
  });

  it('preview is cheap text + references (no media)', () => {
    const interpretation = interpret('a short film about a woman returning home');
    const plan = buildCreativePlan({ projectType: interpretation.projectType });
    const preview = buildPreview(plan, buildSeedBible(interpretation));
    expect(preview.scenes.length).toBe(plan.scenes.length);
    expect(preview.scenes[0].keyframe).toBeNull();
    expect(preview.runtimeSeconds).toBe(plan.totalRuntimeSeconds);
    expect(Array.isArray(preview.characters)).toBe(true);
  });

  it('adapter maps the semantic plan into a manifest-shaped outline (no LLM)', () => {
    const interpretation = interpret('a 60-second commercial for a skincare brand');
    const plan = buildCreativePlan({ projectType: interpretation.projectType });
    const manifest = adaptPlanToManifest(plan, { title: 'Skincare', logline: 'premium' });
    expect(manifest.scenes.length).toBe(plan.scenes.length);
    expect(manifest.scenes[0].shots).toBeDefined();
    expect(manifest.scenes[0].duration_sec).toBeGreaterThanOrEqual(5);
    expect(manifest.master_style.length).toBeGreaterThan(0);
    expect(manifest.negative_prompt_suffix).toContain('animation');
  });

  it('nextAction becomes REVIEW_PLAN when a plan exists', () => {
    expect(nextActionFor('PLANNING', true, true)).toBe('REVIEW_PLAN');
    expect(nextActionFor('PLANNING', true, false)).toBe('BUILD_BIBLE');
    expect(nextActionFor('PREVIEW', true, true)).toBe('APPROVE_PREVIEW');
  });
});