import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, LOOK_FIELDS, buildLook, lookResolution, lookToPrompt } from '../look';

/**
 * Phase 5, first slice (2026-11-04): the look object is typed, normalised and projected.
 *
 * Persistence — save, name, reuse — is the next slice and needs a table. This one settles the
 * shape so that migration is not written against an unexercised type.
 */

describe('buildLook normalises rather than passing values through', () => {
  it('keeps valid values', () => {
    const look = buildLook({ name: 'Noir', lens: 85, movement: 'push-in', lighting: 'low-key', grade: 'monochrome', resolution: 1440 });
    expect(look).toEqual({ name: 'Noir', lens: 85, movement: 'push-in', lighting: 'low-key', grade: 'monochrome', resolution: 1440 });
  });

  it('falls back to the default for a value outside the ladder', () => {
    const look = buildLook({ lens: 40 as never, movement: 'dolly-zoom' as never, resolution: 4320 as never });
    expect(look.lens).toBe(DEFAULT_LOOK.lens);
    expect(look.movement).toBe(DEFAULT_LOOK.movement);
    expect(look.resolution).toBe(DEFAULT_LOOK.resolution);
  });

  it('trims and caps a name, and treats a blank one as default', () => {
    expect(buildLook({ name: '  Noir  ' }).name).toBe('Noir');
    expect(buildLook({ name: '   ' }).name).toBe(DEFAULT_LOOK.name);
    expect(buildLook({ name: 'x'.repeat(200) }).name.length).toBe(60);
  });

  it('is deterministic and idempotent', () => {
    const once = buildLook({ name: 'Noir', lens: 85 });
    expect(buildLook(once)).toEqual(once);
  });
});

describe('the prompt projection is deterministic', () => {
  it('describes the lens by focal length rather than restating the number alone', () => {
    expect(lookToPrompt(buildLook({ lens: 18 }))).toContain('wide, deep focus');
    expect(lookToPrompt(buildLook({ lens: 135 }))).toContain('compressed background');
  });

  it('carries every field that changes the image', () => {
    const prompt = lookToPrompt(buildLook({ lens: 50, movement: 'orbit', lighting: 'neon', grade: 'teal-orange' }));
    expect(prompt).toContain('50mm');
    expect(prompt).toContain('camera orbit');
    expect(prompt).toContain('neon lighting');
    expect(prompt).toContain('teal-orange grade');
  });

  it('two looks differing in one field produce different prompts', () => {
    const a = lookToPrompt(buildLook({ grade: 'warm' }));
    const b = lookToPrompt(buildLook({ grade: 'cool' }));
    expect(a).not.toBe(b);
  });
});

describe('the resolution ladder stays 9:16', () => {
  it('maps each tier to a 9:16 frame', () => {
    for (const resolution of LOOK_FIELDS.resolution) {
      const size = lookResolution(buildLook({ resolution }));
      expect(size.height).toBe(resolution);
      expect(size.width / size.height).toBeCloseTo(9 / 16, 3);
    }
  });
});