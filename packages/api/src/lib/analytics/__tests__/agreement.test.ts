import { describe, expect, it } from 'vitest';
import { ATTRIBUTION_WINDOW_MS, agreementFor, attributeEdit, type ChapterEdit, type SuggestionAcceptance } from '../agreement';

/**
 * Agreement (2026-11-17).
 *
 * Direction comes from the accepted suggestion's mapping, evidence from the critique's before/after scores. These
 * tests pin the two cases that matter most: the creator who moves the text toward what they accepted, and the
 * creator who moves it the other way — the case where they told the profile two opposite things.
 */
const T0 = 1_700_000_000_000;

function acceptance(overrides: Partial<SuggestionAcceptance> = {}): SuggestionAcceptance {
  return {
    userId: 'u1',
    chapterId: 'c1',
    axis: 'pacing',
    direction: 'more',
    acceptedAt: T0,
    scoresBefore: { pacing: 40, sensory: 80, voice: 90 },
    ...overrides,
  };
}

function edit(overrides: Partial<ChapterEdit> = {}): ChapterEdit {
  return { userId: 'u1', chapterId: 'c1', editedAt: T0 + 60_000, scoresAfter: { pacing: 70, sensory: 80, voice: 90 }, ...overrides };
}

describe('the join is scoped by creator and chapter, inside a window', () => {
  it('attributes an edit that follows an acceptance on the same chapter', () => {
    expect(attributeEdit(edit(), [acceptance()])).not.toBeNull();
  });

  it('an edit to a different chapter is not joined', () => {
    expect(attributeEdit(edit({ chapterId: 'c2' }), [acceptance()])).toBeNull();
  });

  it('another creator\'s acceptance is never borrowed', () => {
    expect(attributeEdit(edit({ userId: 'u2' }), [acceptance()])).toBeNull();
  });

  it('an edit outside the window is not attributable', () => {
    expect(attributeEdit(edit({ editedAt: T0 + ATTRIBUTION_WINDOW_MS + 1 }), [acceptance()])).toBeNull();
    expect(attributeEdit(edit({ editedAt: T0 + ATTRIBUTION_WINDOW_MS }), [acceptance()])).not.toBeNull();
  });

  it('a stale acceptance does not outrank a fresh one', () => {
    const fresh = acceptance({ acceptedAt: T0 + 120_000, direction: 'less' });
    const owned = attributeEdit(edit({ editedAt: T0 + 180_000 }), [acceptance(), fresh]);
    expect(owned?.direction).toBe('less');
  });

  it('an edit with no preceding acceptance is ignored, not counted as disagreement', () => {
    expect(agreementFor(null, edit())).toBeNull();
  });
});

describe('the verdict', () => {
  it('an edit toward the accepted direction is agreement', () => {
    expect(agreementFor(acceptance(), edit())?.verdict).toBe('agreement');
  });

  it('an edit the other way is disagreement — the creator told the profile two opposite things', () => {
    const result = agreementFor(acceptance({ direction: 'more' }), edit({ scoresAfter: { pacing: 20 } }));
    expect(result?.verdict).toBe('disagreement');
    expect(result?.before).toBe(40);
    expect(result?.after).toBe(20);
  });

  it('no movement is no-change, not agreement', () => {
    expect(agreementFor(acceptance(), edit({ scoresAfter: { pacing: 40 } }))?.verdict).toBe('no-change');
  });

  it('a restyle-style "different" direction has no directional claim', () => {
    expect(agreementFor(acceptance({ direction: 'different' }), edit())?.verdict).toBe('no-direction');
  });

  it('framing acceptance is served by sensory grounding (the #435 mapping)', () => {
    const framing = acceptance({ axis: 'framing', scoresBefore: { sensory: 30 }, direction: 'more' });
    const result = agreementFor(framing, edit({ scoresAfter: { sensory: 65 } }));
    expect(result?.dimension).toBe('sensory');
    expect(result?.verdict).toBe('agreement');
  });

  it('voice has no directional verdict, and says so rather than guessing', () => {
    const voice = acceptance({ axis: 'unclassified' });
    const result = agreementFor(voice, edit());
    expect(result?.verdict).toBe('no-direction');
    expect(result?.dimension).toBeNull();
  });

  it('a missing score is no-direction rather than a zero', () => {
    const result = agreementFor(acceptance({ scoresBefore: {} }), edit());
    expect(result?.verdict).toBe('no-direction');
    expect(result?.before).toBeNull();
  });
});
