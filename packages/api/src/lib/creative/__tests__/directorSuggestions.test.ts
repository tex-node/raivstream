import { describe, it, expect } from 'vitest';
import { buildDirectorSuggestions } from '../director/suggestions';
import { buildCreativePlan } from '../production/plan';

type Brief = { originalIntent: string };

describe('contextual Director suggestions', () => {
  it('commercial: offers product/premium directions', () => {
    const s = buildDirectorSuggestions({
      projectType: 'COMMERCIAL',
      brief: { originalIntent: 'Create a cinematic commercial for my skincare product.' } as Brief,
      bible: { version: 1, brand: { name: 'GlowHaus' } } as never,
    });
    const labels = s.map((x) => x.label.toLowerCase()).join(' | ');
    expect(labels).toContain('product');
    expect(labels).toContain('premium');
    expect(s[s.length - 1].label).toBe('You decide');
  });

  it('story: uses the character and story directions, not commercial ones', () => {
    const s = buildDirectorSuggestions({
      projectType: 'STORY',
      brief: { originalIntent: 'A woman returns home.' } as Brief,
      bible: { version: 1, characters: [{ name: 'Amara' }] } as never,
      plan: buildCreativePlan({ projectType: 'STORY' }),
    });
    const labels = s.map((x) => x.label).join(' | ');
    expect(labels).toContain('Amara');
    expect(labels.toLowerCase()).not.toContain('product the hero');
  });

  it('education: offers clarity/example directions', () => {
    const s = buildDirectorSuggestions({
      projectType: 'EDUCATION',
      brief: { originalIntent: 'A lesson about photosynthesis.' } as Brief,
    });
    const labels = s.map((x) => x.label.toLowerCase()).join(' | ');
    expect(labels).toContain('clearer');
  });

  it('current scene: focuses the suggestion on that scene', () => {
    const plan = buildCreativePlan({ projectType: 'STORY' });
    const s = buildDirectorSuggestions({ projectType: 'STORY', plan, currentSceneId: plan.scenes[1].sceneId });
    expect(s.some((x) => x.label.includes('Scene 2'))).toBe(true);
  });

  it('review context: grounds the top suggestion in the actual finding', () => {
    const s = buildDirectorSuggestions({
      projectType: 'COMMERCIAL',
      reviewFindings: [{ description: 'Hairstyle changes between scenes', suggestedFixInstruction: 'Restore the established hairstyle in the later scene.' }],
    });
    expect(s[0].instruction).toBe('Restore the established hairstyle in the later scene.');
  });

  it('suggestions are distinct and outcome-oriented (no technical instructions)', () => {
    const s = buildDirectorSuggestions({ projectType: 'COMMERCIAL' });
    const labels = s.map((x) => x.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(s.every((x) => !/lens|ffmpeg|provider|model|h3|flux/i.test(x.label))).toBe(true);
  });
});
