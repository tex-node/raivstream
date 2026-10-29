import { describe, it, expect } from 'vitest';
import { canExportStory } from '../exportEligibility';

/**
 * The UI gate must match the server boundary exactly. If this drifts, the button
 * comes back and the user meets a 403 from storyVideoExportService.
 */
describe('canExportStory', () => {
  it('allows only an R16 session on a KIDS project', () => {
    expect(canExportStory({ isR16Session: true, audienceMode: 'KIDS' })).toBe(true);
  });

  it('refuses a KIDS project from a non-R16 session', () => {
    expect(canExportStory({ isR16Session: false, audienceMode: 'KIDS' })).toBe(false);
  });

  it('refuses a GENERAL project even from an R16 session', () => {
    expect(canExportStory({ isR16Session: true, audienceMode: 'GENERAL' })).toBe(false);
  });

  it('treats a missing audienceMode as ineligible', () => {
    expect(canExportStory({ isR16Session: true, audienceMode: null })).toBe(false);
    expect(canExportStory({ isR16Session: true, audienceMode: undefined })).toBe(false);
  });

});

describe('canExportStory - general tier', () => {
  it('allows a GENERAL story on the main app', () => {
    expect(canExportStory({ isR16Session: false, audienceMode: 'GENERAL' })).toBe(true);
  });

  it('refuses a GENERAL story on R16', () => {
    expect(canExportStory({ isR16Session: true, audienceMode: 'GENERAL' })).toBe(false);
  });

  it('refuses an unknown audience mode on either surface', () => {
    expect(canExportStory({ isR16Session: false, audienceMode: 'UNKNOWN' })).toBe(false);
    expect(canExportStory({ isR16Session: true, audienceMode: 'UNKNOWN' })).toBe(false);
  });
});