import { describe, expect, it } from 'vitest';
import { routeProduction } from '../capabilityRouter';
import { buildCreativePlan } from '../plan';

/**
 * Per-shot production — Phase 4's subject (2026-11-04).
 *
 * Shots existed in the plan and reached the provider manifest, but production collapsed each
 * scene into ONE still: routeProduction ignored scene.shots, so 0 of 435 asset rows carried a
 * shotId and no scene had two shots to address.
 *
 * The multiplier is why this is opt-in rather than default: every scene template carries three
 * shotIdeas, so per-shot production triples the stills - a 4-scene project goes from 4 assets
 * (4 x 80 = 320 credits) to 12 (960). A default that triples cost is a spend decision.
 */

const plan = buildCreativePlan({
  projectType: 'STORY' as never,
  brief: { originalIntent: 'A lighthouse keeper finds a lost bird' } as never,
});

describe('the default still collapses shots, and says so', () => {
  it('emits one IMAGE spec per scene when perShot is not requested', () => {
    const specs = routeProduction(plan, null).filter((spec) => spec.kind === 'IMAGE');
    expect(specs).toHaveLength(plan.scenes.length);
    expect(specs.every((spec) => !(spec as { shotId?: string }).shotId)).toBe(true);
  });
});

describe('per-shot production emits one spec per shot', () => {
  const specs = routeProduction(plan, null, null, { perShot: true });
  const stills = specs.filter((spec) => spec.kind === 'IMAGE');
  const expectedShots = plan.scenes.reduce((total, scene) => total + scene.shots.length, 0);

  it('emits one IMAGE spec per shot across the whole plan', () => {
    expect(stills).toHaveLength(expectedShots);
    expect(expectedShots).toBe(plan.scenes.length * 3);
  });

  it('each still carries its own shotId, and the ids are unique', () => {
    const ids = stills.map((spec) => (spec as { shotId?: string }).shotId);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a shot still names its shot in the prompt, so the image is not the scene composite', () => {
    const first = stills[0] as { shotId: string; prompt: string };
    const shot = plan.scenes[0].shots[0];
    expect(first.shotId).toBe(shot.shotId);
    expect(first.prompt).toContain(shot.description.slice(0, 12));
  });

  it('the cost multiplier is stated: three stills per scene', () => {
    expect(stills.length).toBe(plan.scenes.length * 3);
    expect(plan.scenes.length * 80).toBe(320);
    expect(stills.length * 80).toBe(plan.scenes.length * 240);
  });
});
