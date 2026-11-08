/**
 * Story-derived scenes (2026-11-08).
 *
 * THE DEFECT THIS REPLACES. `buildSimpleScenes` returned a fixed six-card template - a school
 * variant (Home, Road to School, School Gate, Classroom, Problem, Happy Ending) and a general
 * variant (Beginning, First Step, New Friend, Discovery, Problem, Happy Ending) - sliced to a count
 * that defaulted to 6, with only the `Discovery` description touched by story text. A template and a
 * derivation produce the same SHAPE of output; the labels are what tell them apart, and the labels
 * said "template". That is why scenes read as picked at random from the story rather than derived
 * from it.
 *
 * WHAT THIS DOES. Splits the chapter into beats and makes one scene per beat, with the title taken
 * from the beat's own words. No fixed count, no fixed sequence, no padding: a short story produces
 * few scenes, a long story produces as many as it has beats.
 *
 * R16. A kids story that would otherwise produce gaps is COMPRESSED BEFORE splitting - not
 * truncated. Compression keeps the first and last beats (the spine and the ending) and condenses the
 * middle, so every surviving beat is whole. A film whose last beat was cut has no resolution, which
 * is worse than a gap.
 */

export interface DerivedScene {
  title: string;
  description: string;
  locationType?: string;
  indoorOutdoor?: string;
  mood?: string;
  /** The sentence range this scene came from - the traceability the tests assert on. */
  sourceBeat: string;
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z"'])/;
const MAX_SCENES = 60;

/** Split a chapter body into beats: sentences, grouped so a beat is a beat and not a scrap. */
export function splitBeats(body: string): string[] {
  const text = (body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  return text
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** A fragment is a beat that opens or closes mid-clause - the shape a truncated split produces. */
export function isFragment(beat: string): boolean {
  const text = beat.trim();
  if (!text) return true;
  if (/^(and then|then|but|so|because|which|who|that)\b/i.test(text)) return true;
  return !/[.!?"']$/.test(text);
}

function titleFrom(beat: string, index: number): string {
  const words = beat
    .replace(/^["']|["']$/g, '')
    .split(/\s+/)
    .slice(0, 6)
    .join(' ')
    .replace(/[,;:.!?]+$/, '');
  return words.length > 0 ? words : `Scene ${index + 1}`;
}

/**
 * Compress beats to a budget WITHOUT losing the spine: first beat, last beat, and a condensed
 * middle. Used only where the surface has a scene budget (R16). This is summarisation-shaped -
 * merged beats stay whole sentences - never a slice off the end.
 */
export function compressBeatsForBudget(beats: string[], max: number): string[] {
  if (max <= 0) return [];
  if (beats.length <= max) return beats;
  if (max === 1) return [beats[0]];

  const first = beats[0];
  const last = beats[beats.length - 1];
  const middleCount = Math.max(0, max - 2);
  const middle = beats.slice(1, -1);

  if (middleCount === 0) return [first, last];

  // Condense by merging consecutive beats, so each survivor is a complete (multi-sentence) beat.
  const merged: string[] = [];
  const bucketSize = Math.ceil(middle.length / middleCount);
  for (let i = 0; i < middle.length; i += bucketSize) {
    merged.push(middle.slice(i, i + bucketSize).join(' '));
  }

  return [first, ...merged.slice(0, middleCount), last];
}

export interface SceneSource {
  title: string;
  originalIdea?: string | null;
  audienceMode?: string | null;
  chapters: Array<{ title: string; summary: string; body: string }>;
}

/**
 * Derive scenes from the story itself. `maxScenes` is a budget, not a template: it compresses beats
 * (keeping first and last) rather than truncating them.
 */
export function deriveScenesFromStory(project: SceneSource, options: { maxScenes?: number } = {}): DerivedScene[] {
  const chapter = project.chapters[0];
  // Body only: a chapter summary is metadata about the story, not a beat inside it. Including it
  // produced a scene whose text appears nowhere in the chapter.
  const beats = splitBeats(chapter?.body ?? '');
  if (beats.length === 0) return [];

  const budget = options.maxScenes ?? MAX_SCENES;
  const selected = budget >= beats.length ? beats : compressBeatsForBudget(beats, budget);

  return selected.map((beat, index) => ({
    title: titleFrom(beat, index),
    description: beat,
    locationType: undefined,
    indoorOutdoor: undefined,
    mood: undefined,
    sourceBeat: beat,
  }));
}
