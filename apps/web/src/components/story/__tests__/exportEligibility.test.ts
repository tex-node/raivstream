import { describe, it, expect } from 'vitest';
import { canExportStory, exportUnavailableReason } from '../exportEligibility';

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

  it('explains which condition failed', () => {
    expect(exportUnavailableReason({ isR16Session: true, audienceMode: 'GENERAL' })).toMatch(/kids/i);
    expect(exportUnavailableReason({ isR16Session: false, audienceMode: 'KIDS' })).toMatch(/R16/i);
  });
});
