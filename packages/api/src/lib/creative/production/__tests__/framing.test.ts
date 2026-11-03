import { describe, expect, it } from 'vitest';
import { IDENTITY_FRAMING, applyIdentityFraming } from '../identityBlock';

/**
 * Identity-bearing framing, measured 2026-11-03: the same still scored 70 in full body and
 * 80 at medium/waist-up, because a 576x1024 full-body frame gives the face ~12k px against
 * the reference plate's ~250k px. The rule is a default for stills that carry identity, not
 * a mandate for every frame.
 */

describe('the rule', () => {
  it('an identity-bearing still gets the framing phrase', () => {
    const decision = applyIdentityFraming('Introduce the obstacle and raise the stakes.', {
      characters: [{ name: 'Lighthouse Keeper' }],
    });
    expect(decision.applied).toBe(true);
    expect(decision.reason).toBe('identity-bearing');
    expect(decision.prompt).toContain(IDENTITY_FRAMING);
  });

  it('a still with no character keeps its framing', () => {
    const wide = 'An empty lighthouse on a cliff at dusk, wide establishing shot.';
    const decision = applyIdentityFraming(wide, { characters: [] });
    expect(decision.applied).toBe(false);
    expect(decision.reason).toBe('no-character');
    expect(decision.prompt).toBe(wide);
  });

  it('a beat that requires a wide overrides, and says so', () => {
    const wide = 'The keeper walks the cliff path, full-body, wide shot.';
    const decision = applyIdentityFraming(wide, {
      characters: [{ name: 'Lighthouse Keeper' }],
      wideShotRequired: true,
    });
    expect(decision.applied).toBe(false);
    expect(decision.reason).toBe('beat-override');
    expect(decision.prompt).toBe(wide);
  });

  it('is idempotent — a prompt that already carries the phrase is not doubled', () => {
    const once = applyIdentityFraming('A beat.', { characters: [{ name: 'Lost Bird' }] });
    const twice = applyIdentityFraming(once.prompt, { characters: [{ name: 'Lost Bird' }] });
    expect(twice.prompt).toBe(once.prompt);
  });

  it('a blank character name does not count as identity-bearing', () => {
    const decision = applyIdentityFraming('A beat.', { characters: [{ name: '   ' }] });
    expect(decision.applied).toBe(false);
    expect(decision.reason).toBe('no-character');
  });

  it('a wide beat with no character is still no-character, not an override', () => {
    const decision = applyIdentityFraming('Wide establishing shot.', { characters: [] });
    expect(decision.reason).toBe('no-character');
  });
});