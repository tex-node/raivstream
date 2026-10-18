import { describe, it, expect } from 'vitest';
import { canExportStoryVideo } from '../exportEligibility';

/**
 * D-074 — the UI gate must match the server's two conditions (R16 context +
 * KIDS project). Mismatch is what produced a button that always 403'd.
 */

describe('canExportStoryVideo', () => {
  it('allows an R16 session on a KIDS project', () => {
    expect(canExportStoryVideo({ isR16: true, audienceMode: 'KIDS' })).toBe(true);
  });

  it('blocks an R16 session on a GENERAL project (the 403 bug)', () => {
    expect(canExportStoryVideo({ isR16: true, audienceMode: 'GENERAL' })).toBe(false);
  });

  it('blocks a non-R16 session even on a KIDS project', () => {
    expect(canExportStoryVideo({ isR16: false, audienceMode: 'KIDS' })).toBe(false);
  });

  it('blocks when the audience mode has not loaded yet', () => {
    expect(canExportStoryVideo({ isR16: true, audienceMode: null })).toBe(false);
    expect(canExportStoryVideo({ isR16: true, audienceMode: undefined })).toBe(false);
  });
});
