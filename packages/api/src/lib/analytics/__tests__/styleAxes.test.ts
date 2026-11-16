import { describe, expect, it } from 'vitest';
import { STYLE_AXES, axisForCriticCategory, axisForDirectorLabel, axisForRewriteAction, axisForSuggestion } from '../styleAxes';
import { acceptedSignal, shownSignal } from '../tasteSignals';

/**
 * Style axes (2026-11-16).
 *
 * The profile needs to know WHICH axis a suggestion moved, not just that one was accepted. Every surface is a
 * small enumerable set of product labels, so the axis is mapped - no model call, because a classifier per chip is
 * a cost that grows with every render.
 */
describe('the axis is mapped from labels, never inferred by a model', () => {
  it('four axes plus an honest unclassified', () => {
    expect(STYLE_AXES).toEqual(['pacing', 'framing', 'lighting', 'tone', 'unclassified']);
  });

  it('director labels map to the axis they actually move', () => {
    expect(axisForDirectorLabel('Strengthen conflict')).toBe('pacing');
    expect(axisForDirectorLabel('Make it feel more premium')).toBe('tone');
    expect(axisForDirectorLabel('Make the product the hero')).toBe('framing');
  });

  it('rewrite chips map by their own labels', () => {
    expect(axisForRewriteAction('Increase tension')).toBe('pacing');
    expect(axisForRewriteAction('Make this funnier')).toBe('tone');
  });

  it('"Develop this idea" is unclassified rather than forced into an axis', () => {
    // Forcing it would teach the profile noise: it moves no style axis.
    expect(axisForRewriteAction('Develop this idea')).toBe('unclassified');
    expect(axisForDirectorLabel('an unknown label')).toBe('unclassified');
  });

  it('question options do not move a style axis', () => {
    expect(axisForSuggestion('question', 'A dog going to school')).toBe('unclassified');
  });

  it('critic categories map where they name a style axis', () => {
    expect(axisForCriticCategory('lighting')).toBe('lighting');
    expect(axisForCriticCategory('composition')).toBe('framing');
    expect(axisForCriticCategory('somethingElse')).toBe('unclassified');
  });
});

describe('the axis travels with the join', () => {
  it('shown and accepted carry the same axis for the same suggestion', () => {
    const shown = shownSignal('director', 'Make it feel more premium.', 'Make it feel more premium');
    const accepted = acceptedSignal('director', 'Make it feel more premium.', 'Make it feel more premium');
    expect(shown.properties.axis).toBe('tone');
    expect(accepted.properties.axis).toBe('tone');
    // The join key is unchanged by the axis.
    expect(shown.properties.suggestionKey).toBe(accepted.properties.suggestionKey);
  });

  it('an unlabelled suggestion is unclassified rather than wrong', () => {
    expect(shownSignal('rewrite', 'some text').properties.axis).toBe('unclassified');
  });

  it('no signal carries the label or the text', () => {
    const signal = acceptedSignal('director', 'Make it feel more premium.', 'Make it feel more premium');
    expect(JSON.stringify(signal)).not.toContain('premium');
  });
});
