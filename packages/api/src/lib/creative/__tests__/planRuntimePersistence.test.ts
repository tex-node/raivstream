import { describe, expect, it } from 'vitest';
import { buildCreativePlan } from '../production/plan';

/**
 * Runtime persistence (2026-11-04).
 *
 * A prior session opened this as "totalRuntimeSeconds is declared nowhere" — it was a failed
 * grep read as absence. The field is declared at `plan.ts:70` and produced at `plan.ts:315`
 * from the ordered scene durations. What was missing was a test: `musicChargeRace.test.ts`
 * supplied `totalRuntimeSeconds: 30` as a fixture literal, so a green suite could not have
 * noticed the field's absence.
 *
 * These assert against a plan the builder actually made, and against the sum it computes.
 */

function sumOfScenes(plan: { scenes: Array<{ estimatedDurationSeconds: number }> }): number {
  return plan.scenes.reduce((total, scene) => total + scene.estimatedDurationSeconds, 0);
}

describe('the plan persists its runtime', () => {
  it('a 30-second idea carries the target and a runtime equal to its scenes', () => {
    const plan = buildCreativePlan({
      projectType: 'STORY' as never,
      brief: { originalIntent: 'A lighthouse keeper finds a lost bird', durationSeconds: 30 } as never,
    });

    expect(plan.targetDurationSeconds).toBe(30);
    // The sum is what the plan BUILDS; the target is what the creator ASKED for. They are
    // separate fields on purpose - collapsing them would make the timeline disagree with itself.
    expect(plan.totalRuntimeSeconds).toBe(sumOfScenes(plan));
    expect(plan.totalRuntimeSeconds).toBeGreaterThan(0);
  });

  it('an idea with no stated duration carries the summed scene durations', () => {
    const plan = buildCreativePlan({
      projectType: 'STORY' as never,
      brief: { originalIntent: 'A lighthouse keeper finds a lost bird' } as never,
    });

    expect(plan.targetDurationSeconds).toBeUndefined();
    expect(plan.totalRuntimeSeconds).toBe(sumOfScenes(plan));
  });

  it('the runtime is a finite number, which is what the audio and derivation paths need', () => {
    const plan = buildCreativePlan({ projectType: 'STORY' as never, brief: null as never });
    expect(Number.isFinite(plan.totalRuntimeSeconds)).toBe(true);
    // Math.max(1, Math.round(x)) is NaN for undefined - the shape the consumers would hit.
    expect(Number.isFinite(Math.max(1, Math.round(plan.totalRuntimeSeconds)))).toBe(true);
  });
});