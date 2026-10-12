import { describe, expect, it } from 'vitest';
import { VISUAL_STYLE_OPTIONS, R16_STYLE_VALUES, stylesForAudience } from '../storyVisualStyleOptions';

describe('story visual style options', () => {
  it('main app shows all 10 styles, including the new Cartoon value', () => {
    expect(VISUAL_STYLE_OPTIONS).toHaveLength(10);
    expect(stylesForAudience(false)).toHaveLength(10);
    expect(VISUAL_STYLE_OPTIONS.some((o) => o.value === 'CARTOON')).toBe(true);
  });

  it('R16 shows exactly three restricted styles, in brand order', () => {
    const r16 = stylesForAudience(true);
    expect(r16).toHaveLength(3);
    expect(r16.map((o) => o.value)).toEqual(['CARTOON', 'THREE_D_ANIMATED', 'ANIME']);
    expect([...R16_STYLE_VALUES].sort()).toEqual(['ANIME', 'CARTOON', 'THREE_D_ANIMATED']);
  });

  it('R16 labels the third style "3D Animation"', () => {
    const threeD = stylesForAudience(true).find((o) => o.value === 'THREE_D_ANIMATED');
    expect(threeD?.r16Label).toBe('3D Animation');
  });
});
