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
export const DEFAULT_R16_STORY_VISUAL_STYLE: StoryVisualStyleKey = 'STORYBOOK_ILLUSTRATION';

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
