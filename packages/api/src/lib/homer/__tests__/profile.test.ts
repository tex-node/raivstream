import { describe, expect, it } from 'vitest';
import { deriveCreatorProfile } from '../profile';

const at = new Date('2026-11-22T10:00:00Z');
const ev = (category: string, outcome: string) => ({ category, value: 'x', provenance: 'USER_APPROVED', outcome, at });

describe('deriveCreatorProfile - Homer remembering a creator', () => {
  it('says nothing about someone who has decided nothing', () => {
    const profile = deriveCreatorProfile([]);
    expect(profile.empty).toBe(true);
    expect(profile.axes.every((axis) => axis.lean === 0)).toBe(true);
    expect(profile.axes[0]!.because).toMatch(/Nothing decided yet/);
  });

  it('moves only on acceptances and rejections, never on silence', () => {
    const profile = deriveCreatorProfile([ev('CAMERA', 'PROPOSED'), ev('CAMERA', 'PROPOSED')]);
    expect(profile.empty).toBe(true);
    expect(profile.evidenceCount).toBe(0);
  });

  it('leans toward stillness after accepting camera decisions', () => {
    const profile = deriveCreatorProfile([ev('CAMERA', 'ACCEPTED'), ev('CAMERA', 'ACCEPTED'), ev('MOVEMENT', 'REJECTED')]);
    const stillness = profile.axes.find((axis) => axis.axis === 'STILLNESS')!;
    expect(stillness.accepted).toBe(2);
    expect(stillness.rejected).toBe(1);
    expect(stillness.lean).toBeGreaterThan(0);
    expect(stillness.because).toMatch(/kept the camera still in 2 of 3 decisions/);
  });

  it('leans away when rejections outnumber acceptances', () => {
    const profile = deriveCreatorProfile([ev('TONE', 'ACCEPTED'), ev('TONE', 'REJECTED'), ev('MOOD', 'REJECTED')]);
    const warmth = profile.axes.find((axis) => axis.axis === 'WARMTH')!;
    expect(warmth.lean).toBeLessThan(0);
  });

  it('counts every category Homer actually asks about', () => {
    // The regression (2026-11-22): the map named CAMERA/MOVEMENT/EDIT/FRAMING/LIGHTING/TONE, of which Homer emits none but
    // MOOD - so a real four-row loop derived an empty profile. Every question Homer can ask must produce evidence.
    const categories = [
      'VISUAL_TREATMENT',
      'MOOD',
      'WORLD_TREATMENT',
      'TIME_OF_DAY',
      'PACING',
      'CHARACTER_PRESENTATION',
      'CAMERA_PERSPECTIVE',
    ] as const;
    for (const category of categories) {
      const profile = deriveCreatorProfile([ev(category, 'ACCEPTED')]);
      expect(profile.empty, category).toBe(false);
      expect(profile.evidenceCount, category).toBe(1);
    }
  });
  it('ignores categories it has no axis for, so new decisions do not silently bend the profile', () => {
    const profile = deriveCreatorProfile([ev('SOMETHING_NEW', 'ACCEPTED')]);
    expect(profile.empty).toBe(true);
  });
});
