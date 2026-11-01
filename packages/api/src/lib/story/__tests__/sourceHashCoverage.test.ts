import { describe, it, expect } from 'vitest';
import { computeSourceHash } from '../storyVideoExportService';

const pairs = [
  { sceneId: 'scene-b', assetId: 'asset-2' },
  { sceneId: 'scene-a', assetId: 'asset-1' },
];

/**
 * A project-level flag that changes the rendered output must change the hash.
 * `identityRefsEnabled` flips the composed prompt for every scene, so a cache hit
 * across a flag flip serves an export the flag should have changed - the same
 * class as a flag that is true in the database and false in the code.
 */
describe('computeSourceHash covers project-level behaviour flags', () => {
  it('flipping identityRefsEnabled changes the hash', () => {
    const off = computeSourceHash(pairs, { identityRefsEnabled: false });
    const on = computeSourceHash(pairs, { identityRefsEnabled: true });
    expect(on).not.toBe(off);
  });

  it('is deterministic for the same composition in the same order', () => {
    expect(computeSourceHash(pairs, { identityRefsEnabled: true })).toBe(
      computeSourceHash([...pairs], { identityRefsEnabled: true }),
    );
  });

  it('changes when the composition order changes', () => {
    // Order is part of identity: the same scenes in a different sequence are a
    // different film. Sorting by sceneId would hide that.
    expect(computeSourceHash(pairs, { identityRefsEnabled: true })).not.toBe(
      computeSourceHash([...pairs].reverse(), { identityRefsEnabled: true }),
    );
  });

  it('a missing flag hashes as false, which is the text path', () => {
    expect(computeSourceHash(pairs)).toBe(computeSourceHash(pairs, { identityRefsEnabled: false }));
  });

  it('still separates renderer versions (the E1 behaviour)', () => {
    expect(computeSourceHash(pairs, 'v1')).not.toBe(computeSourceHash(pairs, 'v2'));
    expect(computeSourceHash(pairs, { version: 'v9', identityRefsEnabled: true })).not.toBe(
      computeSourceHash(pairs, { version: 'v9', identityRefsEnabled: false }),
    );
  });
});
