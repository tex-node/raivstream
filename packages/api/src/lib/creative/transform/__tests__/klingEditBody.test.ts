import { describe, expect, it } from 'vitest';
import { assertKlingEditShape, toKlingEditBody, TransformShapeError } from '../klingEditBody';

/**
 * The shape check runs before the charge (2026-11-14).
 *
 * The kling contract is verified: required prompt + video_url, optional refs, 3-30 s, 720p/1080p. A body
 * that violates any of that is rejected locally, for free - because a provider rejection after a 5,260
 * credit charge proves nothing except that the money moved.
 */
const valid = { videoUrl: 'https://cdn/src.mp4', prompt: 'Relight: warm evening, hard shadows', resolution: '720p', durationSeconds: 10 };

describe('kling edit shape', () => {
  it('accepts a valid spec and builds the contract body', () => {
    expect(() => assertKlingEditShape(valid)).not.toThrow();
    expect(toKlingEditBody(valid)).toMatchObject({ video_url: valid.videoUrl, resolution: '720p', duration: 10 });
  });

  it('rejects a relative or missing video url', () => {
    expect(() => assertKlingEditShape({ ...valid, videoUrl: '/local/path.mp4' })).toThrow(TransformShapeError);
    expect(() => assertKlingEditShape({ ...valid, videoUrl: '' })).toThrow(/videoUrl/);
  });

  it('rejects an empty prompt', () => {
    expect(() => assertKlingEditShape({ ...valid, prompt: '   ' })).toThrow(/prompt is required/);
  });

  it('rejects a resolution the contract does not offer', () => {
    expect(() => assertKlingEditShape({ ...valid, resolution: '480p' })).toThrow(/resolution must be one of/);
  });

  it('rejects a duration outside 3-30 s, including zero and a missing one', () => {
    expect(() => assertKlingEditShape({ ...valid, durationSeconds: 2 })).toThrow(/durationSeconds/);
    expect(() => assertKlingEditShape({ ...valid, durationSeconds: 31 })).toThrow(/durationSeconds/);
    expect(() => assertKlingEditShape({ ...valid, durationSeconds: Number.NaN })).toThrow(/durationSeconds/);
  });

  it('rejects more than 10 reference images', () => {
    expect(() => assertKlingEditShape({ ...valid, imageUrls: Array.from({ length: 11 }, (_, i) => `https://cdn/r${i}.png`) }))
      .toThrow(/at most 10/);
  });
});
