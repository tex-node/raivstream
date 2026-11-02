import { describe, expect, it } from 'vitest';
import {
  QUARANTINE_IDENTITY_FLOOR,
  feedExclusionWhere,
  feedQuarantineIsWired,
  isQuarantined,
  quarantineVerdict,
  resolveSourceProducedAssetId,
  shouldSurface,
  shouldSurfaceVideo,
} from '../quarantine';

/**
 * The trigger, in one line: 97 of 109 image assets scored below the identity floor
 * (0–80 against 85), every flag on `characterIdentity`. Per-asset review cannot
 * absorb that, so quarantine is a population treatment.
 */

describe('quarantine fails OPEN on unknown, unlike approval which fails closed', () => {
  it('an unscored asset is NOT quarantined', () => {
    expect(isQuarantined({ scores: null })).toBe(false);
    expect(quarantineVerdict({ scores: null })).toEqual({ quarantined: false, reason: 'unscored' });
  });

  it('a missing or non-numeric identity key is unscored, not below floor', () => {
    for (const scores of [{}, { characterIdentity: null }, { characterIdentity: 'n/a' }, { characterIdentity: Number.NaN }] as unknown[]) {
      expect(isQuarantined({ scores: scores as Record<string, unknown> })).toBe(false);
    }
  });

  it('getting this direction backwards would hide the whole unscored library', () => {
    // Explicit: approval rejects these, quarantine does not.
    expect(shouldSurface('feed', { scores: null })).toBe(true);
  });
});

describe('the floor is a boundary, not a range', () => {
  it('just below the floor is quarantined', () => {
    expect(quarantineVerdict({ scores: { characterIdentity: QUARANTINE_IDENTITY_FLOOR - 1 } })).toEqual({
      quarantined: true,
      reason: 'below_floor',
      score: QUARANTINE_IDENTITY_FLOOR - 1,
      floor: QUARANTINE_IDENTITY_FLOOR,
    });
  });

  it('exactly at the floor is not quarantined', () => {
    expect(isQuarantined({ scores: { characterIdentity: QUARANTINE_IDENTITY_FLOOR } })).toBe(false);
  });

  it('a zero identity score is quarantined and reports the score', () => {
    const verdict = quarantineVerdict({ scores: { characterIdentity: 0 } });
    expect(verdict.quarantined).toBe(true);
    if (verdict.quarantined) expect(verdict.score).toBe(0);
  });
});

describe('three surfaces, three behaviours', () => {
  const below = { scores: { characterIdentity: 10 } };

  it('feed excludes', () => expect(shouldSurface('feed', below)).toBe(false));
  it('library includes', () => expect(shouldSurface('library', below)).toBe(true));
  it('direct link includes', () => expect(shouldSurface('direct', below)).toBe(true));

  it('an at-floor asset is promoted everywhere', () => {
    const at = { scores: { characterIdentity: 90 } };
    expect(shouldSurface('feed', at)).toBe(true);
    expect(shouldSurface('library', at)).toBe(true);
    expect(shouldSurface('direct', at)).toBe(true);
  });
});

describe('the feed where-fragment', () => {
  it('excludes exactly the ids it was given', () => {
    expect(feedExclusionWhere(['a', 'b'])).toEqual({ id: { notIn: ['a', 'b'] } });
  });

  it('an empty list stays an active clause rather than vanishing', () => {
    expect(feedExclusionWhere([])).toEqual({ id: { notIn: [] } });
  });
});

describe('the honest capability gate — reports on data, not schema', () => {
  it('is inert when no video carries a source (a fresh database)', () => {
    // The column exists; the DATA does not. A predicate that claimed to be wired
    // because a column exists would be the false pass this project keeps catching.
    expect(feedQuarantineIsWired(0)).toBe(false);
  });

  it('is live once at least one video carries a source', () => {
    expect(feedQuarantineIsWired(1)).toBe(true);
  });

  it('today: 0 of 14 videos carry a source, so the filter is inert', () => {
    // Measured 2026-11-02: no Video-creating path reads a CreativeOutput, and the URL
    // join between videos.mp4Url and creative_outputs.assetUrl returns 0 matches.
    expect(feedQuarantineIsWired(0)).toBe(false);
  });
});

describe('an unsourced video is fail-open, like an unscored asset', () => {
  it('a video with no source is surfaced even with a below-floor score present', () => {
    // If the link is missing we do not know which asset the score belongs to.
    expect(shouldSurfaceVideo('feed', { scores: null, sourceProducedAssetId: null })).toBe(true);
    expect(shouldSurfaceVideo('feed', { scores: { characterIdentity: 0 }, sourceProducedAssetId: null })).toBe(true);
  });

  it('a sourced video below floor is excluded from the feed', () => {
    expect(
      shouldSurfaceVideo('feed', { scores: { characterIdentity: 0 }, sourceProducedAssetId: 'ast_1' }),
    ).toBe(false);
  });

  it('a sourced, at-floor video is surfaced', () => {
    expect(
      shouldSurfaceVideo('feed', { scores: { characterIdentity: 90 }, sourceProducedAssetId: 'ast_1' }),
    ).toBe(true);
  });

  it('library and direct link include a sourced below-floor video', () => {
    const input = { scores: { characterIdentity: 0 }, sourceProducedAssetId: 'ast_1' };
    expect(shouldSurfaceVideo('library', input)).toBe(true);
    expect(shouldSurfaceVideo('direct', input)).toBe(true);
  });
});

describe('the publish-time resolver never guesses', () => {
  it('returns null for absent, empty, whitespace and non-strings', () => {
    for (const value of [null, undefined, '', '   ', 42 as unknown as string]) {
      expect(resolveSourceProducedAssetId(value as string)).toBeNull();
    }
  });

  it('passes through a real id, trimmed', () => {
    expect(resolveSourceProducedAssetId(' ast_1 ')).toBe('ast_1');
  });
});
