import { describe, it, expect } from 'vitest';
import { applyMasterVisualBible } from '../visualBible';

const BIBLE = {
  master_style: 'Cinematic live-action photorealism, 35mm anamorphic lens, Kodachrome color grade',
  negative_prompt_suffix: '2d, animation, cartoon, illustration, anime, 3d render, low quality, morphing',
  characters: {
    MARCUS: '34-year-old West African man, short cropped hair, dark olive bomber jacket',
    LENA: '28-year-old East Asian woman, long black hair, red trench coat',
  },
};

describe('applyMasterVisualBible', () => {
  it('returns the prompt untouched when there is no bible', () => {
    const out = applyMasterVisualBible({ prompt: 'a scene', target: 'VIDEO' });
    expect(out).toEqual({ prompt: 'a scene', negativePrompt: null });
  });

  it('prepends the master style anchor verbatim', () => {
    const out = applyMasterVisualBible({ prompt: 'Marcus walks the alley', bible: BIBLE, target: 'VIDEO' });
    expect(out.prompt).toContain(`${BIBLE.master_style}. Marcus walks the alley`);
  });

  it('does not double-prepend the style anchor when already present', () => {
    const out = applyMasterVisualBible({ prompt: `${BIBLE.master_style}. Marcus walks`, bible: BIBLE, target: 'VIDEO' });
    expect(out.prompt.split(BIBLE.master_style).length - 1).toBe(1);
  });

  it('appends --no suffix to the positive prompt for VIDEO (H3 has no negative field)', () => {
    const out = applyMasterVisualBible({ prompt: 'Marcus walks', bible: BIBLE, target: 'VIDEO' });
    expect(out.prompt).toContain('--no 2d, animation, cartoon, illustration, anime, 3d render, low quality, morphing');
    expect(out.negativePrompt).toBeNull();
  });

  it('puts the suffix into the real negative prompt for IMAGE', () => {
    const out = applyMasterVisualBible({ prompt: 'Marcus walks', negativePrompt: 'blurry, distorted', bible: BIBLE, target: 'IMAGE' });
    expect(out.negativePrompt).toContain('blurry, distorted');
    expect(out.negativePrompt).toContain('animation');
    expect(out.prompt).not.toContain('--no');
  });

  it('dedupes negative tags already present', () => {
    const out = applyMasterVisualBible({ prompt: 'Marcus walks', negativePrompt: 'animation, low quality', bible: BIBLE, target: 'IMAGE' });
    const matches = (out.negativePrompt ?? '').toLowerCase().split('animation').length - 1;
    expect(matches).toBe(1);
  });

  it('injects only the scene characters passed in, verbatim', () => {
    const out = applyMasterVisualBible({ prompt: 'Marcus walks', bible: BIBLE, sceneCharacters: ['MARCUS'], target: 'VIDEO' });
    expect(out.prompt).toContain('Character MARCUS: 34-year-old West African man, short cropped hair, dark olive bomber jacket');
    expect(out.prompt).not.toContain('LENA');
  });

  it('does not duplicate a character anchor already present', () => {
    const prompt = `${BIBLE.master_style}. Marcus in a 34-year-old West African man, short cropped hair, dark olive bomber jacket scene`;
    const out = applyMasterVisualBible({ prompt, bible: BIBLE, sceneCharacters: ['MARCUS'], target: 'VIDEO' });
    expect(out.prompt.split('dark olive bomber jacket').length - 1).toBe(1);
  });

  it('is idempotent for the full VIDEO pipeline', () => {
    const once = applyMasterVisualBible({ prompt: 'Marcus walks the wet alley', bible: BIBLE, sceneCharacters: ['MARCUS'], target: 'VIDEO' });
    const twice = applyMasterVisualBible({ prompt: once.prompt, bible: BIBLE, sceneCharacters: ['MARCUS'], target: 'VIDEO' });
    expect(twice.prompt).toBe(once.prompt);
  });
});