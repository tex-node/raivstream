export const STORY_VISUAL_STYLE_BLOCKS = {
  STORYBOOK_ILLUSTRATION: {
    label: 'Storybook Illustration',
    prompt:
      "beautiful children's storybook illustration, soft colors, warm lighting, expressive friendly characters, clean composition, whimsical but clear",
  },
  THREE_D_ANIMATED: {
    label: '3D Animated',
    prompt:
      'high-quality 3D animated family-film style, expressive characters, soft cinematic lighting, detailed environment, charming proportions, polished render',
  },
  ANIME: {
    label: 'Anime',
    prompt:
      'clean anime-inspired animation style, expressive eyes, dynamic but child-safe composition, colorful background, polished frame',
  },
  CARTOON: {
    label: 'Cartoon',
    prompt:
      'bright 2D cartoon style, bold clean outlines, flat vivid colors, expressive friendly exaggerated characters, simple uncluttered background, playful and child-safe',
  },
  COMIC_BOOK: {
    label: 'Comic Book',
    prompt:
      'bright comic-book illustration, clean line art, expressive poses, vivid colors, panel-ready composition, no speech bubbles or text',
  },
  PHOTOREALISTIC: {
    label: 'Photorealistic',
    prompt:
      'photorealistic cinematic scene, natural lighting, realistic textures, believable environment, shallow depth of field where appropriate',
  },
  WATERCOLOR: {
    label: 'Watercolor',
    prompt:
      'gentle watercolor illustration, soft paper texture, flowing color washes, warm light, expressive friendly characters, delicate storybook detail',
  },
  CLAYMATION: {
    label: 'Claymation',
    prompt:
      'handcrafted clay animation look, tactile sculpted characters, soft studio lighting, charming miniature environment, warm family-friendly tone',
  },
  CINEMATIC_FANTASY: {
    label: 'Cinematic Fantasy',
    prompt:
      'cinematic fantasy illustration, atmospheric lighting, rich environment detail, magical but child-safe wonder, clear emotional storytelling',
  },
  AFRICAN_FOLKTALE_ILLUSTRATION: {
    label: 'African Folktale Illustration',
    prompt:
      'warm African folktale illustration style, rich colors, patterned textiles, expressive characters, atmospheric lighting, handcrafted storybook feel',
  },
} as const;

export type StoryVisualStyleKey = keyof typeof STORY_VISUAL_STYLE_BLOCKS;

export const DEFAULT_STORY_VISUAL_STYLE: StoryVisualStyleKey = 'STORYBOOK_ILLUSTRATION';
export const DEFAULT_R16_STORY_VISUAL_STYLE: StoryVisualStyleKey = 'CARTOON';

/**
 * The scene styles R16 (r16.raivstream.com) may SELECT. The main app keeps the
 * full set. Enforced on WRITE only — a project whose stored style is outside this
 * set keeps rendering (compatibility read), per the confirmed policy.
 */
export const R16_VISUAL_STYLE_KEYS = ['CARTOON', 'THREE_D_ANIMATED', 'ANIME'] as const;

/** True when `value` is one of the R16-selectable scene styles. */
export function isR16VisualStyle(value: string | null | undefined): boolean {
  return !!value && (R16_VISUAL_STYLE_KEYS as readonly string[]).includes(value);
}

/** Set form of R16_VISUAL_STYLE_KEYS — used for O(1) generation-time lookup. */
export const R16_ALLOWED_STYLES = new Set<string>(R16_VISUAL_STYLE_KEYS);

/**
 * Remap a stored style to an R16-safe one at **generation time only**.
 * Does NOT affect what is written to the database; write-path enforcement
 * (`assertR16VisualStyle`) already runs separately on the write side.
 *
 * For KIDS audience mode: any style outside the R16 approved set maps to
 * CARTOON. Logs `[r16.style] legacy=<stored> mapped=CARTOON projectId=<id>`
 * when a remap actually occurs.
 */
export function enforceR16Style(
  value: string | null | undefined,
  audienceMode: string | null | undefined,
  projectId?: string,
): StoryVisualStyleKey {
  const normalised = normaliseStoryVisualStyle(value);
  if (audienceMode !== 'KIDS') return normalised;
  if (R16_ALLOWED_STYLES.has(normalised)) return normalised;
  console.info(`[r16.style] legacy=${normalised} mapped=CARTOON projectId=${projectId ?? 'unknown'}`);
  return 'CARTOON';
}

export function normaliseStoryVisualStyle(value?: string | null): StoryVisualStyleKey {
  if (!value) return DEFAULT_STORY_VISUAL_STYLE;
  const trimmed = value.trim();
  if (trimmed in STORY_VISUAL_STYLE_BLOCKS) return trimmed as StoryVisualStyleKey;
  const byLabel = Object.entries(STORY_VISUAL_STYLE_BLOCKS).find(([, style]) => style.label.toLowerCase() === trimmed.toLowerCase());
  return byLabel ? (byLabel[0] as StoryVisualStyleKey) : DEFAULT_STORY_VISUAL_STYLE;
}

export function styleLabel(value?: string | null) {
  return STORY_VISUAL_STYLE_BLOCKS[normaliseStoryVisualStyle(value)].label;
}

export function stylePromptBlock(value?: string | null) {
  return STORY_VISUAL_STYLE_BLOCKS[normaliseStoryVisualStyle(value)].prompt;
}
