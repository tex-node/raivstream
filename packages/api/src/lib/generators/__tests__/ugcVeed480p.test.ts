import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Module mocks must be hoisted before any imports ───────────────────────────

vi.mock('../falVeed', () => ({
  submitFalVeed: vi.fn(async () => 'req_ugc_1'),
  getFalVeedStatus: vi.fn(),
  cancelFalVeed: vi.fn(),
}));

vi.mock('../falFlux2', () => ({
  submitFalFlux2: vi.fn(async () => 'req_flux2_1'),
  getFalFlux2Status: vi.fn(),
  cancelFalFlux2: vi.fn(),
}));

vi.mock('../falH3Max', () => ({
  submitFalH3Max: vi.fn(async () => 'req_h3_1'),
  getFalH3MaxStatus: vi.fn(),
  cancelFalH3Max: vi.fn(),
}));

vi.mock('../providerRateLimit', () => ({
  getDefaultProviderLimiter: () => ({
    tryAcquire: () => ({ ok: true, release: () => {} }),
  }),
  providerIdForModel: (model: string) => {
    if (model === 'VEED_FABRIC' || model === 'FLUX2' || model === 'H3_MAX') return 'fal';
    return 'other';
  },
  readProviderLimits: () => ({ maxConcurrency: 0, minIntervalMs: 0 }),
  createProviderLimiter: () => ({
    tryAcquire: () => ({ ok: true, release: () => {} }),
  }),
}));

import { submitGenerationJob } from '../index';
import { submitFalVeed } from '../falVeed';
import { submitFalH3Max } from '../falH3Max';
import { readFalMediaConfig, isFalCapabilityLive } from '../../mediaProviders/index';

afterEach(() => vi.clearAllMocks());

// ── Config gate ───────────────────────────────────────────────────────────────

describe('UGC config gate (FAL_UGC_ENABLED)', () => {
  it('defaults ugcEnabled to false with empty env', () => {
    const c = readFalMediaConfig({});
    expect(c.ugcEnabled).toBe(false);
    expect(isFalCapabilityLive(c, 'ugc')).toBe(false);
  });

  it('blocks UGC when FAL_UGC_ENABLED is absent even if all other gates are open', () => {
    const c = readFalMediaConfig({
      FAL_MEDIA_PROVIDER_ENABLED: 'true',
      FAL_REAL_PROVIDER_CALLS_ENABLED: 'true',
      FAL_MAX_REQUESTS: '10',
      FAL_KEY: 'test-key',
    });
    expect(c.ugcEnabled).toBe(false);
    expect(isFalCapabilityLive(c, 'ugc')).toBe(false);
  });

  it('enables UGC when FAL_UGC_ENABLED=true and all other gates are open', () => {
    const c = readFalMediaConfig({
      FAL_MEDIA_PROVIDER_ENABLED: 'true',
      FAL_REAL_PROVIDER_CALLS_ENABLED: 'true',
      FAL_UGC_ENABLED: 'true',
      FAL_MAX_REQUESTS: '10',
      FAL_KEY: 'test-key',
    });
    expect(c.ugcEnabled).toBe(true);
    expect(isFalCapabilityLive(c, 'ugc')).toBe(true);
  });
});

// ── 480p enforcement in the dispatcher ───────────────────────────────────────

describe('VEED Fabric 480p enforcement in dispatcher', () => {
  it('passes resolution: "480p" to submitFalVeed when no resolution in input', async () => {
    await submitGenerationJob({
      model: 'VEED_FABRIC',
      prompt: 'presenter',
      seedImageUrl: 'https://example.com/img.png',
      audioUrl: 'https://example.com/audio.mp3',
    });
    expect(submitFalVeed).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: '480p' }),
    );
  });

  it('enforces 480p even when caller passes resolution: "720p"', async () => {
    await submitGenerationJob({
      model: 'VEED_FABRIC',
      prompt: 'presenter',
      seedImageUrl: 'https://example.com/img.png',
      audioUrl: 'https://example.com/audio.mp3',
      resolution: '720p',
    });
    expect(submitFalVeed).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: '480p' }),
    );
  });

  it('returns the providerJobId from submitFalVeed', async () => {
    const result = await submitGenerationJob({
      model: 'VEED_FABRIC',
      prompt: 'presenter',
      seedImageUrl: 'https://example.com/img.png',
      audioUrl: 'https://example.com/audio.mp3',
    });
    expect(result.providerJobId).toBe('req_ugc_1');
  });
});

// ── Routing: VEED_FABRIC uses imageUrl + audioUrl ─────────────────────────────

describe('VEED Fabric routing', () => {
  it('passes seedImageUrl as imageUrl and audioUrl as audioUrl to submitFalVeed', async () => {
    await submitGenerationJob({
      model: 'VEED_FABRIC',
      prompt: 'presenter',
      seedImageUrl: 'https://cdn.example.com/presenter.jpg',
      audioUrl: 'https://cdn.example.com/speech.mp3',
    });
    expect(submitFalVeed).toHaveBeenCalledWith({
      imageUrl: 'https://cdn.example.com/presenter.jpg',
      audioUrl: 'https://cdn.example.com/speech.mp3',
      resolution: '480p',
    });
  });
});

// ── Regression: other models not affected ─────────────────────────────────────

describe('regression: H3_MAX resolution not overridden', () => {
  it('passes caller-supplied resolution to H3_MAX unchanged', async () => {
    await submitGenerationJob({
      model: 'H3_MAX',
      prompt: 'cinematic video',
      seedImageUrl: 'https://example.com/frame.png',
      resolution: '1080p',
    });
    expect(submitFalH3Max).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: '1080p' }),
    );
  });

  it('does not call submitFalVeed when model is H3_MAX', async () => {
    await submitGenerationJob({
      model: 'H3_MAX',
      prompt: 'cinematic video',
      seedImageUrl: 'https://example.com/frame.png',
    });
    expect(submitFalVeed).not.toHaveBeenCalled();
  });
});
