import { describe, it, expect, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  isCircuitFailure,
  breakerFor,
  __resetCircuitBreakersForTests,
} from '../resilience/circuitBreaker';

/**
 * D-067 — circuit breaker semantics.
 *
 * The clock is injected rather than faked with timers: the breaker takes `now`,
 * so advancing it is deterministic and needs no timer plumbing.
 */

let clock = 0;

function makeBreaker() {
  return new CircuitBreaker({
    name: 'fal',
    failureThreshold: 5,
    failureWindowMs: 60_000,
    cooldownMs: 30_000,
    now: () => clock,
  });
}

function failsWith(status: number) {
  return () => Promise.reject(Object.assign(new Error(`provider error ${status}`), { status }));
}

const ok = <T,>(value: T) => () => Promise.resolve(value);

beforeEach(() => {
  clock = 1_000_000;
});

describe('CircuitBreaker — closed state', () => {
  it('1. allows calls and records nothing on success', async () => {
    const breaker = makeBreaker();
    await expect(breaker.call(ok('done'))).resolves.toBe('done');

    const snap = breaker.snapshot();
    expect(snap.state).toBe('closed');
    expect(snap.failureCount).toBe(0);
    expect(snap.lastFailureAt).toBeNull();
  });

  it('2. counts failures below the threshold without opening', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < 3; i += 1) {
      await expect(breaker.call(failsWith(500))).rejects.toThrow();
    }
    const snap = breaker.snapshot();
    expect(snap.state).toBe('closed');
    expect(snap.failureCount).toBe(3);
    expect(snap.lastFailureAt).not.toBeNull();
  });

  it('3. opens at the threshold', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < 5; i += 1) {
      await expect(breaker.call(failsWith(500))).rejects.toThrow();
    }
    const snap = breaker.snapshot();
    expect(snap.state).toBe('open');
    expect(snap.openedAt).not.toBeNull();
    expect(snap.nextProbeAt).not.toBeNull();
  });

  it('5. uses a sliding window — old failures do not count', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < 4; i += 1) {
      await expect(breaker.call(failsWith(500))).rejects.toThrow();
    }
    expect(breaker.snapshot().failureCount).toBe(4);

    clock += 61_000; // everything so far is outside the 60 s window
    await expect(breaker.call(failsWith(500))).rejects.toThrow();

    const snap = breaker.snapshot();
    expect(snap.failureCount).toBe(1);
    expect(snap.state).toBe('closed'); // 4 stale + 1 fresh ≠ threshold
  });
});

describe('CircuitBreaker — open state', () => {
  it('4. rejects immediately with a positive retryAfterMs', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < 5; i += 1) {
      await expect(breaker.call(failsWith(500))).rejects.toThrow();
    }

    const call = () => breaker.call(ok('never'));
    await expect(call()).rejects.toBeInstanceOf(CircuitOpenError);

    const err = (await call().catch((e: unknown) => e)) as CircuitOpenError;
    expect(err.retryAfterMs).toBeGreaterThan(0);
    expect(err.retryAfterMs).toBeLessThanOrEqual(30_000);
  });
});

describe('CircuitBreaker — half-open state', () => {
  async function openedBreaker() {
    const breaker = makeBreaker();
    for (let i = 0; i < 5; i += 1) {
      await expect(breaker.call(failsWith(500))).rejects.toThrow();
    }
    clock += 30_000; // cooldown elapsed
    return breaker;
  }

  it('6. allows the first call after cooldown as a probe', async () => {
    const breaker = await openedBreaker();
    const result = await breaker.call(ok('probe-ok'));

    expect(result).toBe('probe-ok');
    expect(breaker.snapshot().state).toBe('closed');
  });

  it('7. rejects a second call while a probe is in flight (retryAfterMs 0)', async () => {
    const breaker = await openedBreaker();

    let releaseProbe!: (value: string) => void;
    const probe = new Promise<string>((resolve) => { releaseProbe = resolve; });
    const inFlight = breaker.call(() => probe);

    const error = (await breaker.call(ok('second')).catch((e: unknown) => e)) as CircuitOpenError;
    expect(error).toBeInstanceOf(CircuitOpenError);
    expect(error.retryAfterMs).toBe(0);

    releaseProbe('probe-done');
    await expect(inFlight).resolves.toBe('probe-done');
  });

  it('8. a successful probe closes and resets the failure count', async () => {
    const breaker = await openedBreaker();
    await breaker.call(ok('ok'));

    const snap = breaker.snapshot();
    expect(snap.state).toBe('closed');
    expect(snap.failureCount).toBe(0);
    expect(snap.openedAt).toBeNull();
    expect(snap.nextProbeAt).toBeNull();
  });

  it('9. a failed probe re-opens and restarts the cooldown from the failure', async () => {
    const breaker = await openedBreaker();
    const failedAt = clock;

    await expect(breaker.call(failsWith(500))).rejects.toThrow();

    const snap = breaker.snapshot();
    expect(snap.state).toBe('open');
    expect(new Date(snap.openedAt!).getTime()).toBe(failedAt);
    expect(new Date(snap.nextProbeAt!).getTime()).toBe(failedAt + 30_000);
  });
});

describe('CircuitBreaker — failure classification', () => {
  it('10. 4xx client errors do not count', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < 10; i += 1) {
      await expect(breaker.call(failsWith(400))).rejects.toThrow();
    }
    expect(breaker.snapshot().state).toBe('closed');
    expect(breaker.snapshot().failureCount).toBe(0);
  });

  it('11. 5xx counts', async () => {
    const breaker = makeBreaker();
    await expect(breaker.call(failsWith(503))).rejects.toThrow();
    expect(breaker.snapshot().failureCount).toBe(1);
  });

  it('12. 429 does not count (that is the rate limiter’s job)', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < 10; i += 1) {
      await expect(breaker.call(failsWith(429))).rejects.toThrow();
    }
    expect(breaker.snapshot().failureCount).toBe(0);
    expect(breaker.snapshot().state).toBe('closed');
  });

  it('13. timeouts and network failures count', async () => {
    const breaker = makeBreaker();

    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(breaker.call(() => Promise.reject(abort))).rejects.toThrow();
    expect(breaker.snapshot().failureCount).toBe(1);

    await expect(breaker.call(() => Promise.reject(new TypeError('fetch failed')))).rejects.toThrow();
    expect(breaker.snapshot().failureCount).toBe(2);
  });

  it('401/403 count, and a provider-neutral RATE_LIMITED code does not', () => {
    expect(isCircuitFailure({ status: 401 })).toBe(true);
    expect(isCircuitFailure({ status: 403 })).toBe(true);
    expect(isCircuitFailure({ status: 429 })).toBe(false);
    expect(isCircuitFailure({ status: 422 })).toBe(false);
    expect(isCircuitFailure({ code: 'RATE_LIMITED', message: 'busy' })).toBe(false);
    expect(isCircuitFailure({ code: 'INVALID_REQUEST', message: 'bad prompt' })).toBe(false);
    expect(isCircuitFailure({ code: 'TIMEOUT', message: 'slow' })).toBe(true);
    expect(isCircuitFailure({ providerStatus: 500 })).toBe(true);
    expect(isCircuitFailure(new Error('ElevenLabs TTS error 503: unavailable'))).toBe(true);
    expect(isCircuitFailure(new Error('ElevenLabs TTS error 400: bad voice'))).toBe(false);
  });
});

describe('breakerFor', () => {
  beforeEach(() => __resetCircuitBreakersForTests());

  it('returns a stable per-provider singleton', () => {
    expect(breakerFor('fal')).toBe(breakerFor('fal'));
    expect(breakerFor('fal')).not.toBe(breakerFor('lyria'));
  });
});
