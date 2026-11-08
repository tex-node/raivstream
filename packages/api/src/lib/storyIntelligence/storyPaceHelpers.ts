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

/**
 * Compress a list to a budget without dropping the ends (2026-11-08).
 *
 * Shared by the scene derivation and the paced blueprint path so the two cannot drift: the old
 * `mergeBlueprintBeatsToMax` joined ALL overflow into one beat, which is a batch of five beats
 * masquerading as one. This keeps the first and last items intact, buckets the middle evenly, and
 * hands each bucket to the caller's merge - so the result is ordered, the ending survives, and no
 * single item swallows the whole story.
 */
export function compressToBudget<T>(items: T[], max: number, merge: (group: T[]) => T): T[] {
  if (max <= 0) return [];
  if (items.length <= max) return items;
  if (max === 1) return [items[0]!];
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const middle = items.slice(1, -1);
  const middleSlots = max - 2;
  if (middleSlots === 0 || middle.length === 0) return [first, last];
  const bucketSize = Math.ceil(middle.length / middleSlots);
  const buckets: T[] = [];
  for (let i = 0; i < middle.length; i += bucketSize) {
    buckets.push(merge(middle.slice(i, i + bucketSize)));
  }
  return [first, ...buckets.slice(0, middleSlots), last];
}
