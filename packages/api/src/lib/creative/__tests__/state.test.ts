import { describe, it, expect } from 'vitest';
import { canTransition, nextActionFor } from '../project/state';
import { buildSeedBible } from '../bible/service';
import { interpret } from '../intent/interpreter';

describe('creative project state', () => {
  it('allows IDEA → INTERPRETING and INTERPRETING → PLANNING', () => {
    expect(canTransition('IDEA', 'INTERPRETING')).toBe(true);
    expect(canTransition('INTERPRETING', 'PLANNING')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransition('IDEA', 'PUBLISHED')).toBe(false);
    expect(canTransition('PLANNING', 'IDEA')).toBe(false);
  });

  it('derives next action from status + bible presence', () => {
    expect(nextActionFor('IDEA', false)).toBe('UNDERSTAND_INTENT');
    expect(nextActionFor('PLANNING', false)).toBe('BUILD_BIBLE');
    expect(nextActionFor('PLANNING', true, true)).toBe('REVIEW_PLAN');
    expect(nextActionFor('PREVIEW', true)).toBe('APPROVE_PREVIEW');
    expect(nextActionFor('REVIEW', true)).toBe('REVIEW_OUTPUT');
    expect(nextActionFor('APPROVED', true)).toBe('APPROVE_OUTPUT');
  });
});

describe('creative bible seeding', () => {
  it('seeds a commercial bible with brand + visual language', () => {
    const interpretation = interpret('Create a 60-second cinematic commercial for a new Nigerian premium skincare brand. Make it feel luxurious, confident and modern.');
    const bible = buildSeedBible(interpretation);
    expect(bible.brand).toBeTruthy();
    expect(bible.visualLanguage?.style).toBe('cinematic');
    expect(bible.constraints?.note).toContain('proposed, not canon');
  });

  it('marks AI assumptions as proposed, not canon', () => {
    const bible = buildSeedBible(interpret('a short film about a woman returning home'));
    expect((bible.canon as any)?.confirmed).toEqual([]);
  });
});