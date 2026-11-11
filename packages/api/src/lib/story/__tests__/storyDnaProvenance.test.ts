import { describe, expect, it } from 'vitest';
import { buildStoryDna } from '../../../routers/story';

/**
 * Is `storyDna.resolution` an extraction of the story, or a plan written before it?
 *
 * The decision this test settles (2026-11-11): if the field is **extracted from the chapter body**,
 * a content contract over it is meaningful - a story that stops before its ending leaves the field
 * empty and the contract fails it for the right reason. If the field is **derived from the idea** (or
 * from scene titles generated alongside it), the field is always populated and a contract that scores
 * its presence is measuring the plan's completeness - `scenes.length === 6` in a schema.
 *
 * The structural fact this file is built on: `buildStoryDna` has **no chapter-body parameter**. It
 * cannot read the story it is supposed to summarise. Everything below is a consequence of that.
 */

const ideaOnly = {
  title: 'The lighthouse keeper',
  originalIdea: 'A lighthouse keeper finds an injured bird and teaches it to fly again',
  theme: null,
  tone: null,
  visualStyle: null,
};

describe('where storyDna comes from', () => {
  it('populates the goal from a constant when the story has no characters', () => {
    const dna = buildStoryDna(ideaOnly, [], []);
    // Not extracted from the story: this is the fallback string, verbatim.
    expect(dna.primaryGoal).toBe('complete the story journey');
  });

  it('names a hero from the idea, not from the chapter', () => {
    const dna = buildStoryDna(ideaOnly, [], []);
    expect(typeof dna.hero).toBe('string');
    expect(dna.hero.length).toBeGreaterThan(0);
    // Every value here came from the idea or a constant; no story text was passed in.
    expect(dna.characterArc).toContain('grows in confidence');
  });

  it('NEVER leaves conflict or resolution empty - both fall back to constants', () => {
    // This is the decisive finding. With no scenes at all, the DNA still reports an obstacle and a
    // resolution, because both fields default to a fixed sentence. A contract that scores presence
    // in this object would pass every story that exists, including one that stops mid-sentence.
    const dna = buildStoryDna(ideaOnly, [], []);
    expect(dna.conflict).toBe('a gentle obstacle to overcome');
    expect(dna.resolution).toBe('a positive ending with learning');
  });
});

describe('a resolution can appear without any story ending existing', () => {
  it('fabricates a resolution from a scene TITLE that merely looks like an ending', () => {
    // The story body is irrelevant - it is not an input. Only the scene title matters.
    const scenes = [{ title: 'Happy Ending', description: 'Everyone smiles.', mood: 'happy' }];
    const dna = buildStoryDna(ideaOnly, [], scenes);
    expect(dna.resolution).toBe('Everyone smiles.');
  });

  it('fabricates a conflict from a scene title too', () => {
    const scenes = [{ title: 'Problem', description: 'The bird will not eat.', mood: 'brave' }];
    const dna = buildStoryDna(ideaOnly, [], scenes);
    expect(dna.conflict).toBe('The bird will not eat.');
  });

  it('a truncated story that has an "ending" scene looks complete to the DNA', () => {
    // The truncation would live in the chapter body, which this function never receives.
    const scenes = [{ title: 'Ending', description: 'It ends.', mood: 'calm' }];
    const dna = buildStoryDna(ideaOnly, [], scenes);
    expect(dna.resolution).toBeTruthy();
  });
});

describe('the consequence for a content contract', () => {
  it('presence in storyDna cannot detect a missing resolution', () => {
    // Two inputs that differ only in whether a scene title matched /ending|happy|finish|home/:
    // the DNA reports a resolution for one and not the other, and never consults the story.
    const withEndingScene = buildStoryDna(ideaOnly, [], [{ title: 'Ending', description: 'It ends.', mood: null }]);
    const withoutScenes = buildStoryDna(ideaOnly, [], []);
    expect(withEndingScene.resolution).toBe('It ends.');
    // Without scenes it is still "present", as a constant - so presence cannot distinguish a resolved
    // story from an unresolved one. The field is populated before the story is read, and there is no
    // path by which it can be empty.
  });
});
