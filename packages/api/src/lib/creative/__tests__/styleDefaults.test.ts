import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../look/look';
import { STYLE_DEFAULTS, isNeutralDefault, lookForDefault, resolveStyleDefault } from '../styleDefaults';

/**
 * Stated style defaults (2026-11-17).
 *
 * Named for technique, never for a person; neutral is genuinely neutral; and every level of the fallback chain
 * reports where it came from, because a forgotten fallback returns neutral for everything and looks like a
 * working lookup.
 */
describe('the defaults table', () => {
  it('is technique-named, never a person', () => {
    for (const entry of Object.values(STYLE_DEFAULTS)) {
      expect(entry.label).not.toMatch(/hitchcock|welles|chaplin|keaton|kubrick|spielberg/i);
      expect(entry.basis.length).toBeGreaterThan(0);
    }
    expect(STYLE_DEFAULTS.suspense.label).toMatch(/slow reveal/);
  });

  it('neutral is exactly the composer default, with no implied house style', () => {
    expect(isNeutralDefault('educational')).toBe(true);
    expect(lookForDefault('educational')).toEqual(DEFAULT_LOOK);
    expect(lookForDefault('commercial')).toEqual(DEFAULT_LOOK);
  });

  it('a genre default actually changes look fields', () => {
    const suspense = lookForDefault('suspense');
    expect(suspense).not.toEqual(DEFAULT_LOOK);
    expect(suspense.lens).toBe(50);
  });
});

describe('the fallback chain, with its source reported', () => {
  it('a creator override wins over the stated default', () => {
    const resolved = resolveStyleDefault({ creatorKey: 'comedy', projectType: 'STORY' });
    expect(resolved.key).toBe('comedy');
    expect(resolved.source).toBe('creator');
  });

  it('with no override, the project type decides', () => {
    const resolved = resolveStyleDefault({ projectType: 'STORY' });
    expect(resolved.source).toBe('stated');
    expect(resolved.key).toBe('drama');
  });

  it('an unknown project type is neutral, and says so', () => {
    const resolved = resolveStyleDefault({ projectType: 'SOMETHING_NEW' });
    expect(resolved.source).toBe('neutral');
    expect(resolved.look).toEqual(DEFAULT_LOOK);
  });

  it('every level can resolve to neutral without pretending otherwise', () => {
    for (const input of [{}, { projectType: null }, { projectType: 'EDUCATION' }]) {
      const resolved = resolveStyleDefault(input);
      expect(resolved.look).toEqual(DEFAULT_LOOK);
      expect(['neutral', 'stated']).toContain(resolved.source);
    }
  });

  it('R16 gets neutral only, never an adult genre default', () => {
    const resolved = resolveStyleDefault({ creatorKey: 'suspense', projectType: 'STORY', isR16: true });
    expect(resolved.source).toBe('r16-neutral');
    expect(resolved.look).toEqual(DEFAULT_LOOK);
  });
});
