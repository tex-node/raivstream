import { describe, it, expect, afterEach } from 'vitest';
import { submitGenerationJob } from '../index';
import { __setDefaultProviderLimiterForTests, type ProviderLimiter } from '../providerRateLimit';
import { breakerFor, __resetCircuitBreakersForTests } from '../../resilience/circuitBreaker';

/**
 * D-067 — layering. The rate limiter must sit OUTSIDE the breaker: a rejection
 * caused by our own concurrency cap says nothing about provider health, so it
 * must never count as a circuit failure. This test pins the order in
 * `submitGenerationJob`.
 */

describe('D-067 — rate limiter outer, breaker inner', () => {
  afterEach(() => {
    __setDefaultProviderLimiterForTests(null);
    __resetCircuitBreakersForTests();
  });

  it('14. a rate-limited rejection does not count as a circuit failure', async () => {
    __resetCircuitBreakersForTests();

    const rejectingLimiter: ProviderLimiter = {
      tryAcquire: () => ({ ok: false, reason: 'at max concurrency (1)' }),
      snapshot: () => ({}),
    };
    __setDefaultProviderLimiterForTests(rejectingLimiter);

    await expect(submitGenerationJob({ model: 'FLUX2', prompt: 'a cat' })).rejects.toThrow(/busy/i);

    const snapshot = breakerFor('fal').snapshot();
    expect(snapshot.failureCount).toBe(0);
    expect(snapshot.state).toBe('closed');
  });
});
