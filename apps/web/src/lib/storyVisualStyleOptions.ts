/**
 * Story visual-style options — single source of truth for the style picker.
 *
 * The full set (10) is shared by the main app and R16; R16 exposes only the
 * restricted allowlist (Cartoon / 3D Animation / Anime). Kept out of the page
 * component so the option list and the R16 filter are unit-testable without a DOM.
 */

export type VisualStyleValue =
  | 'STORYBOOK_ILLUSTRATION'
  | 'THREE_D_ANIMATED'
  | 'ANIME'
  | 'CARTOON'
  | 'COMIC_BOOK'
  | 'PHOTOREALISTIC'
  | 'WATERCOLOR'
  | 'CLAYMATION'
  | 'CINEMATIC_FANTASY'
  | 'AFRICAN_FOLKTALE_ILLUSTRATION';

export type VisualStyleOption = {
  value: VisualStyleValue;
  label: string;
  r16Label: string;
  description: string;
};

/** Full set — the main app shows all of these (order preserved). */
export const VISUAL_STYLE_OPTIONS: VisualStyleOption[] = [
  { value: 'STORYBOOK_ILLUSTRATION', label: 'Storybook Illustration', r16Label: 'Storybook', description: 'Soft colors and warm picture-book charm.' },
  { value: 'THREE_D_ANIMATED', label: '3D Animated', r16Label: '3D Animation', description: 'Polished family-film look with expressive characters.' },
  { value: 'ANIME', label: 'Anime', r16Label: 'Anime', description: 'Clean animated frames with colorful backgrounds.' },
  { value: 'COMIC_BOOK', label: 'Comic Book', r16Label: 'Comic', description: 'Bright line art and panel-ready action.' },
  { value: 'PHOTOREALISTIC', label: 'Photorealistic', r16Label: 'Realistic', description: 'Cinematic realism and natural lighting.' },
  { value: 'WATERCOLOR', label: 'Watercolor', r16Label: 'Watercolor', description: 'Gentle painted texture and soft washes.' },
  { value: 'CLAYMATION', label: 'Claymation', r16Label: 'Clay', description: 'Handmade sculpted character style.' },
  { value: 'CINEMATIC_FANTASY', label: 'Cinematic Fantasy', r16Label: 'Fantasy', description: 'Rich magical scenes with safe wonder.' },
  { value: 'AFRICAN_FOLKTALE_ILLUSTRATION', label: 'African Folktale Illustration', r16Label: 'Folktale', description: 'Rich colors, patterned textiles, handcrafted feel.' },
  { value: 'CARTOON', label: 'Cartoon', r16Label: 'Cartoon', description: 'Bright 2D cartoon look with bold outlines.' },
];

/** R16 (r16.raivstream.com) exposes exactly these three styles. */
export const R16_STYLE_VALUES = new Set<VisualStyleValue>(['CARTOON', 'THREE_D_ANIMATED', 'ANIME']);

/** R16 renders its three styles in this fixed brand order (Cartoon first = default). */
const R16_STYLE_ORDER: VisualStyleValue[] = ['CARTOON', 'THREE_D_ANIMATED', 'ANIME'];

/** The picker options for the given audience: all 10 (main) or the 3 (R16). */
export function stylesForAudience(isR16: boolean): VisualStyleOption[] {
  if (!isR16) return VISUAL_STYLE_OPTIONS;
  return R16_STYLE_ORDER.map((value) => VISUAL_STYLE_OPTIONS.find((o) => o.value === value)!);
}
