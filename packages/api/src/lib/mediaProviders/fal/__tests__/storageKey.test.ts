import { describe, expect, it } from 'vitest';
import { falOutputStorageKey } from '../falStorage';

/**
 * The storage prefix follows the model (2026-11-15).
 *
 * A relight persisted as `generated/fal/h3max/…` because the directory was a per-KIND constant. The path is
 * something a creator may eventually read, so it should name what actually produced the asset.
 */
describe('fal output storage keys', () => {
  it('names the relight model in the path', () => {
    expect(falOutputStorageKey('video', 'req-1', { model: 'relight' })).toBe('generated/fal/relight/req-1.mp4');
  });

  it('keeps the h3max path for every existing caller (regression)', () => {
    expect(falOutputStorageKey('video', 'req-2')).toBe('generated/fal/h3max/req-2.mp4');
    expect(falOutputStorageKey('video', 'req-3', { model: 'h3max' })).toBe('generated/fal/h3max/req-3.mp4');
  });

  it('images keep their own directory', () => {
    expect(falOutputStorageKey('image', 'req-4')).toContain('generated/fal/');
  });
});
