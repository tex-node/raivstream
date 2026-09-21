import { describe, it, expect } from 'vitest';
import {
  createProviderLimiter,
  providerIdForModel,
  readProviderLimits,
} from '../providerRateLimit';

describe('provider rate limiting (Phase 15)', () => {
  it('defaults to unlimited when unset', () => {
    expect(readProviderLimits({})).toEqual({ maxConcurrency: 0, minIntervalMs: 0 });
    const limiter = createProviderLimiter(readProviderLimits({}));
    for (let i = 0; i < 50; i += 1) expect(limiter.tryAcquire('fal').ok).toBe(true);
  });

  it('enforces the concurrency cap per provider and frees on release', () => {
    const limiter = createProviderLimiter({ maxConcurrency: 1, minIntervalMs: 0 });
    const first = limiter.tryAcquire('fal');
    expect(first.ok).toBe(true);
    const second = limiter.tryAcquire('fal');
    expect(second).toMatchObject({ ok: false });
    if (first.ok) first.release();
    expect(limiter.tryAcquire('fal').ok).toBe(true);
    // caps are per-provider
    expect(limiter.tryAcquire('runpod').ok).toBe(true);
  });

  it('does not double-decrement on repeated release', () => {
    const limiter = createProviderLimiter({ maxConcurrency: 1, minIntervalMs: 0 });
    const lease = limiter.tryAcquire('fal');
    expect(lease.ok).toBe(true);
    if (lease.ok) {
      lease.release();
      lease.release();
    }
    expect(limiter.snapshot().fal).toBeUndefined();
    expect(limiter.tryAcquire('fal').ok).toBe(true);
  });

  it('enforces the minimum interval between submissions', () => {
    let now = 1000;
    const limiter = createProviderLimiter({ maxConcurrency: 0, minIntervalMs: 500 }, () => now);
    expect(limiter.tryAcquire('fal').ok).toBe(true);
    expect(limiter.tryAcquire('fal').ok).toBe(false);
    now = 1500;
    expect(limiter.tryAcquire('fal').ok).toBe(true);
  });

  it('maps models to providers', () => {
    expect(providerIdForModel('FLUX2')).toBe('fal');
    expect(providerIdForModel('H3_MAX')).toBe('fal');
    expect(providerIdForModel('VEED_FABRIC')).toBe('fal');
    expect(providerIdForModel('GROK_IMAGINE')).toBe('xai');
    expect(providerIdForModel('KLING_I2V')).toBe('kling');
    expect(providerIdForModel('NANO_BANANA')).toBe('gemini');
    expect(providerIdForModel('WAN_25')).toBe('runpod');
    expect(providerIdForModel('SEEDANCE')).toBe('runpod');
  });
});
