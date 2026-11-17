import { describe, expect, it } from 'vitest';
import { CRITIQUE_MENTION_BELOW, critiqueLine, expandedCritique, visibleCritique, type CritiquePayload } from './chapterCritique';

/**
 * The critique surface's rule (2026-11-17).
 *
 * The scores are already calibrated server-side (lighthouse 100/79/67 vs summary 0/0/0, pinned in the API tests).
 * These tests protect the SURFACE decision: one actionable line, nothing when the chapter is fine, and never a
 * sentence that does not match the dimension it names.
 */
function payload(overrides: Partial<Record<'sensory' | 'pacing' | 'voice', number>> = {}, tooShort = false): CritiquePayload {
  const dimensions = (['sensory', 'pacing', 'voice'] as const).map((key) => ({
    key,
    score: overrides[key] ?? 90,
    lowScoreMeaning:
      key === 'sensory'
        ? 'the story is told in summary rather than images — add light, sound, texture and physical action.'
        : key === 'pacing'
          ? 'every sentence moves at the same speed — vary sentence length and let the important beat breathe.'
          : 'the narration drifts between first and third person, or between past and present tense.',
    measuredBy: 'measure',
  }));
  const lowest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  return { dimensions, lowest, tooShort };
}

describe('the surface shows one thing, and only when it matters', () => {
  it('a chapter low on sensory shows the sensory sentence, not the numbers', () => {
    const shown = visibleCritique(payload({ sensory: 10 }));
    expect(shown?.key).toBe('sensory');
    const line = critiqueLine(shown!);
    expect(line).toContain('Sensory grounding is low');
    expect(line).toContain('summary rather than images');
    expect(line).not.toMatch(/\b10\b/); // the number is not the feedback
  });

  it('the sentence matches the dimension the scorer flagged', () => {
    for (const key of ['sensory', 'pacing', 'voice'] as const) {
      const shown = visibleCritique(payload({ [key]: 5 }));
      expect(shown?.key).toBe(key);
      expect(critiqueLine(shown!).toLowerCase()).toContain(shown!.lowScoreMeaning.split(' —')[0].slice(0, 12).toLowerCase());
    }
  });

  it('a chapter that scores well shows nothing at all', () => {
    expect(visibleCritique(payload({ sensory: 95, pacing: 90, voice: 88 }))).toBeNull();
    expect(visibleCritique(null)).toBeNull();
  });

  it('exactly at the mention line is quiet; one below is not', () => {
    expect(visibleCritique(payload({ sensory: CRITIQUE_MENTION_BELOW }))).toBeNull();
    expect(visibleCritique(payload({ sensory: CRITIQUE_MENTION_BELOW - 1 }))?.key).toBe('sensory');
  });

  it('the expand shows all three, each with its sentence', () => {
    const all = expandedCritique(payload({ sensory: 10, pacing: 20, voice: 30 }));
    expect(all).toHaveLength(3);
    for (const dimension of all) expect(dimension.lowScoreMeaning.length).toBeGreaterThan(20);
  });

  it('a body too short to measure shows nothing rather than a zero', () => {
    expect(visibleCritique(payload({ sensory: 0 }, true))).toBeNull();
    expect(expandedCritique(payload({}, true))).toHaveLength(0);
  });

  it('the copy is an observation, never a verdict', () => {
    const line = critiqueLine(visibleCritique(payload({ pacing: 10 }))!);
    expect(line).not.toMatch(/poor|bad|fail|unacceptable|must fix/i);
    expect(line).toContain('is low —');
  });
});
