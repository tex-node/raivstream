/**
 * Provider submission rate limiting + concurrency control (Phase 15).
 *
 * In-process, per-provider guard applied to generation submissions. It is
 * deliberately a *backpressure* mechanism, not a durable queue: when a provider
 * is at its concurrency cap (or being hit faster than the minimum interval),
 * the submission is rejected with a retryable RATE_LIMITED error instead of
 * piling up in-process. Defaults are unlimited (0) so behavior is unchanged
 * until explicitly configured.
 *
 * Scope note: this is per-process. A multi-process deployment needs a shared
 * backend (e.g. Upstash Redis) — the limiter is intentionally a small interface
 * so a distributed implementation can replace the in-memory one later.
 */

export type ProviderId = 'fal' | 'runpod' | 'xai' | 'kling' | 'gemini';

export interface ProviderLimitConfig {
  /** Max simultaneous in-flight submissions per provider. 0 = unlimited. */
  maxConcurrency: number;
  /** Minimum spacing between submissions per provider, in ms. 0 = no spacing. */
  minIntervalMs: number;
}

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; reason: string };

export interface ProviderLimiter {
  tryAcquire(provider: string): AcquireResult;
  snapshot(): Record<string, number>;
}

function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function readProviderLimits(env: NodeJS.ProcessEnv = process.env): ProviderLimitConfig {
  return {
    maxConcurrency: readNonNegativeInt(env.PROVIDER_MAX_CONCURRENCY, 0),
    minIntervalMs: readNonNegativeInt(env.PROVIDER_MIN_INTERVAL_MS, 0),
  };
}

export function createProviderLimiter(
  config: ProviderLimitConfig = readProviderLimits(),
  now: () => number = Date.now,
): ProviderLimiter {
  const inFlight = new Map<string, number>();
  const lastSubmitAt = new Map<string, number>();

  return {
    tryAcquire(provider: string): AcquireResult {
      if (config.maxConcurrency > 0 && (inFlight.get(provider) ?? 0) >= config.maxConcurrency) {
        return { ok: false, reason: `at max concurrency (${config.maxConcurrency})` };
      }
      if (config.minIntervalMs > 0) {
        const last = lastSubmitAt.get(provider) ?? 0;
        const elapsed = now() - last;
        if (elapsed < config.minIntervalMs) {
          return { ok: false, reason: `rate limited (min interval ${config.minIntervalMs}ms)` };
        }
      }
      inFlight.set(provider, (inFlight.get(provider) ?? 0) + 1);
      lastSubmitAt.set(provider, now());
      let released = false;
      return {
        ok: true,
        release: () => {
          if (released) return;
          released = true;
          const remaining = (inFlight.get(provider) ?? 1) - 1;
          if (remaining <= 0) inFlight.delete(provider);
          else inFlight.set(provider, remaining);
        },
      };
    },
    snapshot: () => Object.fromEntries(inFlight),
  };
}

let defaultLimiter: ProviderLimiter | null = null;

/** Process-wide default limiter (reads env once at first use). */
export function getDefaultProviderLimiter(): ProviderLimiter {
  if (!defaultLimiter) defaultLimiter = createProviderLimiter();
  return defaultLimiter;
}

/** Test seam. */
export function __setDefaultProviderLimiterForTests(limiter: ProviderLimiter | null): void {
  defaultLimiter = limiter;
}

/** Map a generation model key to its provider id for limiting purposes. */
export function providerIdForModel(model: string): ProviderId {
  switch (model) {
    case 'FLUX2':
    case 'H3_MAX':
    case 'VEED_FABRIC':
      return 'fal';
    case 'GROK_IMAGINE':
      return 'xai';
    case 'KLING':
    case 'KLING_I2V':
    case 'KLING_R2V':
      return 'kling';
    case 'NANO_BANANA':
    case 'VEO3':
      return 'gemini';
    case 'FLUX':
    case 'LTX2':
    case 'WAN_25':
    case 'HUNYUAN_VIDEO':
    case 'COG_VIDEO_X':
    case 'SEEDANCE':
    default:
      return 'runpod';
  }
}
