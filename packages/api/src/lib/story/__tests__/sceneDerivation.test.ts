import { describe, expect, it } from 'vitest';
import {
  compressBeatsForBudget,
  deriveScenesFromStory,
  isFragment,
  splitBeats,
} from '../sceneDerivation';

/**
 * Scene derivation, the six-scene template, and R16 compression (2026-11-08).
 *
 * The defect these tests guard: `buildSimpleScenes` returned a fixed six-card template - school
 * (Home, Road to School, School Gate, Classroom, Problem, Happy Ending) and general (Beginning,
 * First Step, ...) - sliced to a count defaulting to 6, with one description touched by story text.
 * A template and a derivation produce the same shape of output; only the labels tell them apart.
 */

const UNUSUAL = {
  title: 'The lighthouse keeper',
  originalIdea: 'A lighthouse keeper finds an injured bird and teaches it to fly again',
  audienceMode: 'GENERAL',
  chapters: [
    {
      title: 'Chapter One',
      summary: 'A keeper finds a bird.',
      body:
        'The keeper climbed the spiral stairs before dawn and found a bird against the glass. Its wing was crooked and it watched him without fear. He carried it down in his cap and set it beside the stove. For a week it would not eat from his hand. On the eighth morning it took a crumb and hopped to the edge of the table. He carried it to the gallery rail and let the wind take it. It fell, then rose, and circled the lamp once before the fog swallowed it.',
    },
  ],
};

const LONG = {
  title: 'A long story',
  audienceMode: 'GENERAL',
  chapters: [
    {
      title: 'One',
      summary: 'A long journey.',
      body: Array.from({ length: 30 }, (_, i) => `Beat number ${i + 1} happens out here.`).join(' '),
    },
  ],
};

const SHORT = {
  title: 'A short story',
  audienceMode: 'GENERAL',
  chapters: [{ title: 'One', summary: 'A brief moment.', body: 'A girl found a coin. She bought bread.' }],
};

describe('scenes come from the story', () => {
  const scenes = deriveScenesFromStory(UNUSUAL);

  it('produces scenes whose titles are the story_w words, not the template_s', () => {
    const titles = scenes.map((scene) => scene.title.toLowerCase()).join(' | ');
    for (const templateTitle of ['home', 'road to school', 'school gate', 'classroom', 'happy ending']) {
      expect(titles).not.toContain(templateTitle);
    }
    expect(titles).toContain('the keeper climbed the spiral stairs');
  });

  it('every scene is traceable to a beat in the body', () => {
    const body = UNUSUAL.chapters[0].body.toLowerCase();
    for (const scene of scenes) {
      expect(body).toContain(scene.description.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 20));
    }
  });

  it('has one scene per beat, and the count is the story_s, not a constant', () => {
    expect(scenes.length).toBe(splitBeats(UNUSUAL.chapters[0].body).length);
    expect(scenes.length).not.toBe(6);
  });
});

describe('no six-scene cap', () => {
  it('a long story produces more than six scenes', () => {
    const scenes = deriveScenesFromStory(LONG);
    expect(scenes.length).toBeGreaterThan(6);
    expect(scenes.length).toBe(30);
  });

  it('a short story does not pad to six', () => {
    const scenes = deriveScenesFromStory(SHORT);
    expect(scenes.length).toBeLessThan(6);
    expect(scenes.length).toBe(2);
  });
});

describe('R16 compresses before splitting and keeps the spine', () => {
  const beats = splitBeats(LONG.chapters[0].body);

  it('compresses to the budget', () => {
    expect(compressBeatsForBudget(beats, 6)).toHaveLength(6);
  });

  it('keeps the first beat and the last beat - the spine and the ending', () => {
    const compressed = compressBeatsForBudget(beats, 6);
    expect(compressed[0]).toBe(beats[0]);
    expect(compressed[compressed.length - 1]).toBe(beats[beats.length - 1]);
  });

  it('never leaves a fragment: every compressed beat is a whole sentence', () => {
    for (const beat of compressBeatsForBudget(beats, 6)) {
      expect(beat.endsWith('.')).toBe(true);
      expect(isFragment(beat)).toBe(false);
    }
  });

  it('an R16 story derives to the budget with no gaps', () => {
    const scenes = deriveScenesFromStory({ ...LONG, audienceMode: 'KIDS' }, { maxScenes: 6 });
    expect(scenes.length).toBe(6);
    expect(scenes[0].description).toBe(beats[0]);
    expect(scenes[scenes.length - 1].description).toBe(beats[beats.length - 1]);
    for (const scene of scenes) expect(isFragment(scene.description)).toBe(false);
  });
});

describe('fragment detection is the gap test', () => {
  it('detects a beat that starts mid-clause', () => {
    expect(isFragment('and then the keeper climbed the stairs.')).toBe(true);
    expect(isFragment('which made the bird turn away.')).toBe(true);
  });

  it('detects a beat that ends mid-clause', () => {
    expect(isFragment('The keeper climbed the spiral stairs before dawn and found')).toBe(true);
  });

  it('accepts a whole sentence', () => {
    expect(isFragment('The keeper climbed the spiral stairs before dawn.')).toBe(false);
  });
});
