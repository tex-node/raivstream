import type { StoryBlueprint } from './types';

/**
 * Clamp blueprint beats to `max`, merging overflow into the last allowed beat
 * so the story ending is never silently dropped.
 * Returns the blueprint unchanged when beats.length <= max.
 */
export function mergeBlueprintBeatsToMax(blueprint: StoryBlueprint, max: number): StoryBlueprint {
  if (blueprint.beats.length <= max) return blueprint;
  const kept = blueprint.beats.slice(0, max - 1);
  const overflow = blueprint.beats.slice(max - 1);
  const merged = {
    label: overflow.map((b) => b.label).join(' + '),
    description: overflow.map((b) => b.description).join(' Then: '),
  };
  return { ...blueprint, beats: [...kept, merged] };
}

/**
 * Compute per-scene video duration from narration word count.
 * Formula: ceil(words/2)+2, clamped to [4, 15] seconds.
 */
export function durationFromNarrationWords(words: number): number {
  if (words <= 0) return 4;
  return Math.min(15, Math.max(4, Math.ceil(words / 2) + 2));
}
