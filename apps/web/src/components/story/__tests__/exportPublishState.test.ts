import { describe, it, expect } from 'vitest';
import { exportPublishState } from '../exportPublishState';

const video = (over: Partial<{ status: string; moderationStatus: string; submittedForPublicationAt: Date | null }> = {}) => ({
  status: 'READY',
  moderationStatus: 'PENDING',
  submittedForPublicationAt: null as Date | null,
  ...over,
});

const base = {
  isR16Session: true,
  audienceMode: 'KIDS',
  exportStatus: 'READY',
  video: null,
  loading: false,
};

describe('exportPublishState', () => {
  it('GENERAL project on an R16 session is hidden (crossed combo)', () => {
    expect(exportPublishState({ ...base, audienceMode: 'GENERAL' })).toBe('hidden');
  });

  it('KIDS project on the main session is hidden (crossed combo)', () => {
    expect(exportPublishState({ ...base, isR16Session: false })).toBe('hidden');
  });

  it('hides while the export is not READY', () => {
    expect(exportPublishState({ ...base, exportStatus: 'PENDING' })).toBe('hidden');
    expect(exportPublishState({ ...base, exportStatus: null })).toBe('hidden');
  });

  it('is loading while the lookup is in flight', () => {
    expect(exportPublishState({ ...base, loading: true })).toBe('loading');
  });

  it('offers publish when no Video row exists yet', () => {
    expect(exportPublishState(base)).toBe('publish');
  });

  it('shows submitted once the creator has asked for kids review', () => {
    expect(exportPublishState({ ...base, video: video({ submittedForPublicationAt: new Date() }) })).toBe('submitted');
  });

  it('shows live once approved', () => {
    expect(exportPublishState({ ...base, video: video({ moderationStatus: 'APPROVED' }) })).toBe('live');
  });

  it('shows processing while the media is not READY', () => {
    expect(exportPublishState({ ...base, video: video({ status: 'PROCESSING' }) })).toBe('processing');
  });

  it('offers submit for a published, READY, unsubmitted video', () => {
    expect(exportPublishState({ ...base, video: video() })).toBe('submit');
  });
});
