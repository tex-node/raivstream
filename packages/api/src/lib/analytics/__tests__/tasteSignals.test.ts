import { describe, expect, it } from 'vitest';
import { acceptedSignal, editedSignal, rejectedSignal, shownSignal, suggestionKey } from '../tasteSignals';

/**
 * Taste signals (2026-11-16).
 *
 * The profile is deferred; the instrumentation comes first. What these tests protect is the two things that make
 * a signal usable later: the join key, and the absence of story text.
 */
describe('taste signals join, and carry no text', () => {
  it('the same suggestion yields the same key from shown, accepted and rejected', () => {
    const text = 'Make the ending more hopeful';
    const shown = shownSignal('rewrite', text);
    const accepted = acceptedSignal('rewrite', text);
    const rejected = rejectedSignal('rewrite', text);
    expect(shown.properties.suggestionKey).toBe(accepted.properties.suggestionKey);
    expect(rejected.properties.suggestionKey).toBe(shown.properties.suggestionKey);
    expect(shown.properties.suggestionKey).toBe(suggestionKey('rewrite', text));
  });

  it('different text, or a different kind, is a different key', () => {
    expect(suggestionKey('rewrite', 'a')).not.toBe(suggestionKey('rewrite', 'b'));
    expect(suggestionKey('rewrite', 'a')).not.toBe(suggestionKey('question', 'a'));
  });

  it('no event carries story text - only keys, lengths and surfaces', () => {
    const shown = shownSignal('director', 'make it cinematic please');
    expect(JSON.stringify(shown)).not.toContain('cinematic');
    expect(Object.values(shown.properties).every((value) => typeof value !== 'object')).toBe(true);
    expect(editedSignal('chapter_edit', 10, 20).properties).toEqual({ surface: 'chapter_edit', beforeLength: 10, afterLength: 20 });
  });

  it('dismissal is its own event, so an ignored suggestion is not counted as rejected', () => {
    const names = [shownSignal('rewrite', 'x').eventName, acceptedSignal('rewrite', 'x').eventName, rejectedSignal('rewrite', 'x').eventName];
    expect(new Set(names).size).toBe(3);
    expect(names).toContain('suggestion_rejected');
  });
});
