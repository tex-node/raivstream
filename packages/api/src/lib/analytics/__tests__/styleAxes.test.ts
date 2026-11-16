import { describe, expect, it } from 'vitest';
import { STYLE_AXES, axisForCriticCategory, axisForDirectorLabel, axisForRewriteAction } from '../styleAxes';
import { directionForLabel, directionForSuggestion } from '../suggestionDirection';
import { acceptedSignal, shownSignal } from '../tasteSignals';

/**
 * Style axes and signed direction (2026-11-16).
 *
 * Both are mapped from product labels, never inferred by a model: a classifier per chip is a cost that grows with
 * every render. Axis answers WHICH dimension moved; direction answers WHICH WAY — and without direction the profile
 * cannot tell "more tension" from "a different ending", because both are pacing.
 */
describe('axes', () => {
  it('four axes plus unclassified', () => {
    expect(STYLE_AXES).toEqual(['pacing', 'framing', 'lighting', 'tone', 'unclassified']);
  });

  it('maps director and rewrite labels, and leaves the unclassified case alone', () => {
    expect(axisForDirectorLabel('Strengthen conflict')).toBe('pacing');
    expect(axisForDirectorLabel('Make it feel more premium')).toBe('tone');
    expect(axisForDirectorLabel('Make the product the hero')).toBe('framing');
    expect(axisForRewriteAction('Increase tension')).toBe('pacing');
    expect(axisForRewriteAction('Develop this idea')).toBe('unclassified');
    expect(axisForCriticCategory('lighting')).toBe('lighting');
  });
});

describe('direction', () => {
  it('separates the two pacing suggestions', () => {
    expect(directionForLabel('Strengthen conflict')).toBe('more');
    expect(directionForLabel('Explore another ending')).toBe('different');
  });

  it('null is a real direction, not a missing one', () => {
    expect(directionForLabel('Develop this idea')).toBeNull();
    expect(directionForSuggestion('question', 'A dog going to school')).toBeNull();
  });

  it('travels on shown and accepted without changing the join', () => {
    const shown = shownSignal('director', 'Strengthen conflict.', 'Strengthen conflict');
    const accepted = acceptedSignal('director', 'Strengthen conflict.', 'Strengthen conflict');
    expect(shown.properties.direction).toBe('more');
    expect(accepted.properties.direction).toBe('more');
    expect(shown.properties.suggestionKey).toBe(accepted.properties.suggestionKey);
  });

  it('no signal carries the label or the text', () => {
    expect(JSON.stringify(acceptedSignal('director', 'Make it feel more premium.', 'Make it feel more premium'))).not.toContain('premium');
  });
});
