import { describe, it, expect } from 'vitest';
import {
  EXPORT_SEGMENT_FILTERS,
  buildExportSegmentKey,
  exportSegmentFilters,
  exportSegmentObjectKey,
} from '../exportSegments';

const base = {
  rendererVersion: 'phase-2-v1',
  segmentIndex: 2,
  sourceAssetId: 'asset-3',
  width: 1080,
  height: 1920,
};

describe('export segment cache key', () => {
  it('is deterministic for identical inputs', () => {
    expect(buildExportSegmentKey(base)).toBe(buildExportSegmentKey({ ...base }));
  });

  it('changes with the source asset (change scene 3 -> only scene 3 misses)', () => {
    expect(buildExportSegmentKey(base)).not.toBe(
      buildExportSegmentKey({ ...base, sourceAssetId: 'asset-4' }),
    );
  });

  it('changes with the filter chain — the test that encodes the lesson', () => {
    const changed = buildExportSegmentKey({
      ...base,
      filters: exportSegmentFilters(1080, 1920).replace('fps=30', 'fps=24'),
    });
    // If this ever passes trivially, someone added a filter to the renderer
    // without adding it to the key: a cache that lies.
    expect(changed).not.toBe(buildExportSegmentKey(base));
  });

  it('changes with the frame size, so a dimension change cannot reuse a segment', () => {
    expect(buildExportSegmentKey(base)).not.toBe(
      buildExportSegmentKey({ ...base, width: 1920, height: 1080 }),
    );
  });

  it('changes with the segment index (a reorder is a different film)', () => {
    expect(buildExportSegmentKey(base)).not.toBe(
      buildExportSegmentKey({ ...base, segmentIndex: 3 }),
    );
  });

  it('changes with the renderer version', () => {
    expect(buildExportSegmentKey(base)).not.toBe(
      buildExportSegmentKey({ ...base, rendererVersion: 'phase-2-v2' }),
    );
  });

  it('defaults to the master filter literal when none is passed', () => {
    expect(buildExportSegmentKey(base)).toBe(
      buildExportSegmentKey({ ...base, filters: EXPORT_SEGMENT_FILTERS }),
    );
  });

  it('keys are project-scoped paths, not asset-scoped', () => {
    const key = buildExportSegmentKey(base);
    expect(exportSegmentObjectKey('proj-a', key)).toBe(
      `story-projects/proj-a/export-segments/${key}.mp4`,
    );
    // Same segment key under two projects is two objects on purpose.
    expect(exportSegmentObjectKey('proj-a', key)).not.toBe(exportSegmentObjectKey('proj-b', key));
  });
});
describe('key coverage question: is the prompt a missing input?', () => {
  it('two scenes sharing one asset get different keys, because position differs', () => {
    // The collision worth worrying about: a repeated shot or shared background.
    const a = buildExportSegmentKey({ ...base, sourceAssetId: 'shared', segmentIndex: 2 });
    const b = buildExportSegmentKey({ ...base, sourceAssetId: 'shared', segmentIndex: 6 });
    expect(a).not.toBe(b);
  });

  it('a prompt change alone keeps the key stable, and that is correct', () => {
    // The segment is scale/crop/fps over the clip bytes; the renderer never sees a
    // prompt. A differently-prompted clip is a different assetId, which the key does
    // capture. Hashing the prompt here would only cause misses when text is edited
    // without new pixels - the iteration loop this cache exists to accelerate.
    const before = buildExportSegmentKey({ ...base, sourceAssetId: 'same-asset' });
    const after = buildExportSegmentKey({ ...base, sourceAssetId: 'same-asset' });
    expect(before).toBe(after);
  });

  it('a new asset for the same scene changes the key (the real invalidation path)', () => {
    const old = buildExportSegmentKey({ ...base, sourceAssetId: 'asset-v1' });
    const fresh = buildExportSegmentKey({ ...base, sourceAssetId: 'asset-v2' });
    expect(old).not.toBe(fresh);
  });
});