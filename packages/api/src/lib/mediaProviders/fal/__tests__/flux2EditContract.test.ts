/**
 * Track D Layer 1 — fal-ai/flux-2/edit contract + adapter.
 */
import { describe, it, expect, vi } from 'vitest';
import { toFlux2EditInput, FLUX_2_EDIT_CONTRACT } from '../contracts';

describe('flux-2/edit contract + adapter', () => {
  it('declares the endpoint with required prompt + image_urls', () => {
    expect(FLUX_2_EDIT_CONTRACT.endpoint).toBe('fal-ai/flux-2/edit');
    expect(FLUX_2_EDIT_CONTRACT.fields.find((f) => f.name === 'prompt')?.required).toBe(true);
    expect(FLUX_2_EDIT_CONTRACT.fields.find((f) => f.name === 'image_urls')?.required).toBe(true);
  });

  it('sends prompt + image_urls, truncating to 4 with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = toFlux2EditInput({ prompt: 'scene', imageUrls: ['a', 'b', 'c', 'd', 'e'], aspectRatio: '9:16' });
    expect(out.image_urls).toEqual(['a', 'b', 'c', 'd']);
    expect(out.prompt).toBe('scene');
    expect(out.image_size).toBe('portrait_16_9');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reference images provided'));
    warn.mockRestore();
  });

  it('throws without a reference image', () => {
    expect(() => toFlux2EditInput({ prompt: 'scene' })).toThrowError(/reference image/);
  });

  it('honours explicit width/height over aspect ratio', () => {
    const out = toFlux2EditInput({ prompt: 'scene', imageUrls: ['a'], width: 720, height: 1280, aspectRatio: '16:9' });
    expect(out.image_size).toEqual({ width: 720, height: 1280 });
  });
});
