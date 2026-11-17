import { describe, expect, it } from 'vitest';
import { CRITIQUE_DIMENSION_AXES, CRITIQUE_ACTIONABLE_BELOW, critiqueFinding } from '../director/critiqueFindings';
import type { StoryCritique } from '../../story/storyCritique';

/**
 * Critique findings → director suggestions (2026-11-17).
 *
 * The axis mapping is the decision this integration rests on: a suggestion that arrives with a WRONG axis teaches
 * the profile the wrong thing, and one that arrives labelled unclassified teaches it nothing - which is honest but
 * must not be a dumping ground.
 */
function critique(overrides: Partial<Record<'sensory' | 'pacing' | 'voice', number>> = {}, tooShort = false): StoryCritique {
  const dimension = (score: number, meaning: string) => ({ score, lowScoreMeaning: meaning, measuredBy: 'm' });
  const result = {
    sensory: dimension(overrides.sensory ?? 95, 'the story is told in summary rather than images — add light, sound, texture and physical action.'),
    pacing: dimension(overrides.pacing ?? 95, 'every sentence moves at the same speed — vary sentence length and let the important beat breathe.'),
    voice: dimension(overrides.voice ?? 95, 'the narration drifts between first and third person, or between past and present tense.'),
    tooShort,
  };
  return result as StoryCritique;
}

describe('the mapping is a decision, recorded', () => {
  it('pacing maps to pacing, sensory to framing, and voice is honestly unclassified', () => {
    expect(CRITIQUE_DIMENSION_AXES.sensory).toBe('framing');
    expect(CRITIQUE_DIMENSION_AXES.pacing).toBe('pacing');
    // Voice is craft consistency, not taste: forcing it into `tone` would teach the profile the wrong thing.
    expect(CRITIQUE_DIMENSION_AXES.voice).toBeNull();
  });
});

describe('the weakest dimension becomes one finding', () => {
  it('carries the mapped axis and the low-score sentence, not a number', () => {
    const finding = critiqueFinding(critique({ sensory: 10 }));
    expect(finding).not.toBeNull();
    expect(finding!.category).toBe('framing');
    expect(finding!.description).toContain('summary rather than images');
    expect(finding!.description).not.toMatch(/\b10\b/);
    expect(finding!.suggestedFixInstruction).toContain('sensory grounding');
  });

  it('pacing arrives with the pacing axis', () => {
    const finding = critiqueFinding(critique({ pacing: 5 }));
    expect(finding!.category).toBe('pacing');
    expect(finding!.description).toContain('same speed');
  });

  it('voice arrives as unclassified rather than mislabelled', () => {
    const finding = critiqueFinding(critique({ voice: 5 }));
    expect(finding!.category).toBe('unclassified');
  });

  it('a chapter that scores well produces no finding at all', () => {
    expect(critiqueFinding(critique({ sensory: 95, pacing: 95, voice: 95 }))).toBeNull();
    expect(critiqueFinding(critique({ sensory: CRITIQUE_ACTIONABLE_BELOW }))).toBeNull();
    expect(critiqueFinding(critique({ sensory: CRITIQUE_ACTIONABLE_BELOW - 1 }))).not.toBeNull();
  });

  it('a body too short to measure produces no finding', () => {
    expect(critiqueFinding(critique({ sensory: 0 }, true))).toBeNull();
    expect(critiqueFinding(null)).toBeNull();
  });

  it('at most one finding: the lowest is the one thing to fix', () => {
    const finding = critiqueFinding(critique({ sensory: 10, pacing: 20, voice: 30 }));
    expect(finding!.description).toContain('summary rather than images');
    expect(finding!.category).toBe('framing');
  });
});
