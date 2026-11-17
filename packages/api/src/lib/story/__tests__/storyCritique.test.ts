import { describe, expect, it } from 'vitest';
import { critiqueStory, scorePacing, scoreSensory, scoreVoice } from '../storyCritique';

/**
 * Critique calibration (2026-11-17).
 *
 * The creative critic was a constant-90 tautology for 802 runs: a filled-in JSON example in the prompt, echoed
 * back, with a threshold that equalled the only producible score. The lesson is a REQUIREMENT here: calibrate
 * against a known-bad input before trusting a good one, and pin the separation so a future change that flattens
 * the scorer fails CI.
 */

const GOOD = `SCENE 1 — THE LIGHTHOUSE
The wind came off the water in long grey ropes, and the salt stuck to the rail. Marta heard the horn first, a low
moan under the clatter of the winch. She carried the lamp up the spiral stairs, one hand on the cold iron, the other
steadying the flame. Oil. Always oil. The glass was gritted with spray, and the light threw a slow blade across the
bay.

SCENE 2 — THE STORM
Thunder rolled, close enough to feel in the teeth. Rain hammered the roof like gravel. She braced the door with a
chair and listened to the sea try it. When the beam swung past, the whole room went white, then black, then white
again, and in the black she heard her own breathing.`;

const BAD = `The character felt that things were difficult and she realised that she had to do something about it. In many
ways it was clear that the situation was important and she understood that the outcome would matter. Overall the
story was about a difficult time and it was clear that everything changed in the end. She thought about the
situation and decided that things would be different and that it was clear that she understood the situation.`;

describe('calibration: a good story and a bad one must separate', () => {
  it('sensory grounding separates by a wide margin', () => {
    const good = scoreSensory(GOOD);
    const bad = scoreSensory(BAD);
    expect(good).toBeGreaterThanOrEqual(60);
    expect(bad).toBeLessThanOrEqual(30);
    expect(good - bad).toBeGreaterThanOrEqual(25);
  });

  it('pacing separates, because uniform sentences read flat', () => {
    expect(scorePacing(GOOD)).toBeGreaterThan(scorePacing(BAD));
  });

  it('a summary-instead-of-scene scores low on sensory, and the meaning says why', () => {
    const critique = critiqueStory(BAD);
    expect(critique.sensory.score).toBeLessThanOrEqual(30);
    expect(critique.sensory.lowScoreMeaning).toMatch(/summary rather than images/);
  });

  it('the dimensions of ONE story are not lockstep', () => {
    // The constant-90 critic scored every dimension identically; a real measure must not.
    const critique = critiqueStory(GOOD);
    const scores = [critique.sensory.score, critique.pacing.score, critique.voice.score];
    expect(new Set(scores).size).toBeGreaterThan(1);
  });

  it('a body too short to measure withholds scores rather than guessing', () => {
    const critique = critiqueStory('She ran.');
    expect(critique.tooShort).toBe(true);
    expect(critique.voice.score).toBe(0);
  });

  it('its ceiling is documented: the sensory measure detects grounding, it does not rank grounded chapters', () => {
    // Honest limit, pinned rather than hidden: a dense paragraph saturates. This is a FLOOR detector. Ranking two
    // grounded chapters would need a different measure (type diversity, image specificity), which is not built.
    const dense = 'Salt, wind, cold iron, the moan of the horn, spray on the glass, oil, flame, thunder, rain.';
    expect(scoreSensory(`${GOOD} ${dense}`)).toBe(100);
  });

  it('no threshold and no gate: the critique returns measurements only', () => {
    const critique = critiqueStory(GOOD);
    expect(Object.keys(critique).sort()).toEqual(['pacing', 'sensory', 'tooShort', 'voice']);
    for (const dimension of [critique.sensory, critique.pacing, critique.voice]) {
      expect(dimension.measuredBy.length).toBeGreaterThan(10);
      expect(dimension.score).toBeGreaterThanOrEqual(0);
      expect(dimension.score).toBeLessThanOrEqual(100);
    }
  });
});
