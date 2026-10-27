/**
 * Operational patterns §1.2 — per-provider circuit breakers.
 *
 * When a provider (fal, ElevenLabs, Lyria, …) is down or hanging, every request
 * otherwise waits out the full client timeout before failing. A breaker turns
 * that into a fast, typed rejection after N failures in a sliding window, then
 * probes once after a cooldown before letting traffic through again.
 *
 * Deliberately in-memory and per-process: web and worker keep independent
 * state. At this scale that is acceptable (and both log to PM2), and it keeps
 * the breaker dependency-free. The interface is small enough to swap for a
 * shared backend later, mirroring `providerRateLimit.ts`.
 *
 * ── What counts as a failure ────────────────────────────────────────────────
 * Only provider-health signals. Rate limits and client errors are NOT health
 * signals — a user with a bad prompt must not open the circuit for everyone, and
 * a 429 storm belongs to `providerRateLimit`, not here.
 *
 *   5xx                        → failure
 *   timeout / AbortError       → failure
 *   network error (fetch throws) → failure
 *   401 / 403                  → failure (a dead key is provider-side
 *                                unavailability from the app's point of view)
 *   429                        → ignored
 *   other 4xx                  → ignored
 *
 * ── Safety boundary ─────────────────────────────────────────────────────────
 * Moderation is NEVER routed through a breaker (D-066). A breaker must not
 * decide "what happens when moderation is down" — that is a policy question
 * answered in DECISIONS.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitOpenError extends Error {
  constructor(
    public readonly provider: string,
    public readonly retryAfterMs: number,
  ) {
    super(`Circuit open for ${provider}`);
    this.name = 'CircuitOpenError';
  }
}

export interface CircuitSnapshot {
  provider: string;
  state: CircuitState;
  /** Failures inside the current sliding window. */
  failureCount: number;
  lastFailureAt: string | null;
  openedAt: string | null;
  nextProbeAt: string | null;
  /** From the most recent health failure - distinguishes an account 403 from a transient 5xx. */
  lastFailureCode?: string | null;
  lastFailureMessage?: string | null;
  lastFailureWasAuth?: boolean | null;
}

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  failureWindowMs?: number;
  cooldownMs?: number;
  /** Test seam. */
  now?: () => number;
}

const DEFAULT_THRESHOLD = 5;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;

function numericStatus(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return n >= 100 && n <= 599 ? n : null;
}

/** Provider-neutral error codes that are not provider-health signals. */
const NON_HEALTH_CODES = new Set([
  'RATE_LIMITED',
  'INVALID_REQUEST',
  'UNSAFE_REQUEST',
  'CANCELLED',
  'PROVIDER_DISABLED',
  'PROVIDER_NOT_CONFIGURED',
  'UNSUPPORTED',
  'DUPLICATE',
  // Our storage failing says nothing about the provider's health.
  'STORAGE_FAILED',
]);

const HEALTH_CODES = new Set(['TIMEOUT', 'PROVIDER_ERROR', 'RESULT_INVALID']);

/**
 * Classify a thrown error: does it say something about provider health?
 * Exported so the rules are testable in isolation from the state machine.
 */
/** 401/403 - the credential or the account is unusable, not the network. */
export function isAuthFailure(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown; providerStatus?: unknown; response?: { status?: unknown }; message?: unknown } | null;
  if (!e || typeof e !== 'object') return false;

  const numeric = (v: unknown): number | null =>
    typeof v === 'number' ? v : typeof v === 'string' && /^\d{3}$/.test(v) ? Number(v) : null;

  const status =
    numeric(e.status) ??
    numeric(e.statusCode) ??
    numeric(e.providerStatus) ??
    numeric(e.response?.status);

  if (status === 401 || status === 403) return true;

  const message = typeof e.message === 'string' ? e.message : '';
  return /\b(401|403)\b/.test(message);
}

export function isCircuitFailure(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return false;
  if (!error || typeof error !== 'object') return true;

  const e = error as {
    name?: string;
    message?: string;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    providerStatus?: unknown;
    response?: { status?: unknown };
  };

  // Provider-neutral codes first — they are more precise than a status.
  const code = typeof e.code === 'string' ? e.code : null;
  if (code && NON_HEALTH_CODES.has(code)) return false;
  if (code && HEALTH_CODES.has(code)) return true;

  const status =
    numericStatus(e.status) ??
    numericStatus(e.statusCode) ??
    numericStatus(e.providerStatus) ??
    numericStatus(e.response?.status);

  if (status !== null) {
    if (status === 429) return false;            // rate limiter's job
    if (status === 401 || status === 403) return true; // dead key = provider unusable
    if (status >= 500) return true;
    return false;                                 // other 4xx = client error
  }

  const message = typeof e.message === 'string' ? e.message : '';
  // Status embedded in a message, e.g. "ElevenLabs TTS error 503: …".
  const embedded = /(?:error|status|http)\s*(\d{3})\b/i.exec(message);
  const embeddedStatus = embedded ? numericStatus(embedded[1]) : null;
  if (embeddedStatus !== null) {
    if (embeddedStatus === 429) return false;
    if (embeddedStatus === 401 || embeddedStatus === 403) return true;
    if (embeddedStatus >= 500) return true;
    return false;
  }

  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  if (/timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(message)) {
    return true;
  }
  // fetch() rejects a network failure as TypeError('fetch failed').
  if (error instanceof TypeError) return true;

  // Unknown shape: treat as a failure. A wrongly-tight circuit surfaces as an
  // error the user can retry; a wrongly-loose one hangs every request.
  return true;
}

export class CircuitBreaker {
  readonly name: string;
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  private state: CircuitState = 'closed';
  /** Failure timestamps inside the sliding window (oldest first). */
  private failures: number[] = [];
  private openedAt: number | null = null;
  private nextProbeAt: number | null = null;
  private probeInFlight = false;
  /** Last health-relevant failure, for the admin dashboard. */
  private lastFailure: { at: number; code: string | null; message: string; auth: boolean } | null = null;

  constructor(opts: CircuitBreakerOptions) {
    this.name = opts.name;
    this.threshold = opts.failureThreshold ?? DEFAULT_THRESHOLD;
    this.windowMs = opts.failureWindowMs ?? DEFAULT_WINDOW_MS;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.now = opts.now ?? Date.now;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const now = this.now();

    if (this.state === 'open' && this.nextProbeAt !== null && now >= this.nextProbeAt) {
      this.state = 'half-open';
      this.probeInFlight = false;
    }

    if (this.state === 'open') {
      const retryAfterMs = Math.max(0, (this.nextProbeAt ?? now) - now);
      throw new CircuitOpenError(this.name, retryAfterMs);
    }

    if (this.state === 'half-open') {
      if (this.probeInFlight) {
        // Exactly one probe at a time: tell callers to wait for its outcome.
        throw new CircuitOpenError(this.name, 0);
      }
      this.probeInFlight = true;
      console.info(`[circuit] half-open probe provider=${this.name}`);
      try {
        const result = await fn();
        this.close();
        return result;
      } catch (error) {
        this.probeInFlight = false;
        if (!isCircuitFailure(error)) {
          // A client-side rejection proves the provider answered — it is healthy.
          this.close();
          throw error;
        }
        this.open(now);
        console.warn(`[circuit] probe failed provider=${this.name} → re-open`);
        throw error;
      }
    }

    // closed
    try {
      const result = await fn();
      return result;
    } catch (error) {
      if (isCircuitFailure(error)) {
        this.failures.push(now);
        this.prune(now);
        this.recordFailure(error, now);
        // Auth failures mean the credential or account is unusable - retrying
        // cannot help, so trip on the FIRST one rather than charging and
        // refunding the user `threshold` times to prove the same thing.
        if (isAuthFailure(error) || this.failures.length >= this.threshold) {
          this.open(now);
          console.warn(
            `[circuit] open provider=${this.name} failureCount=${this.failures.length} window=${this.windowMs}ms${isAuthFailure(error) ? ' reason=auth' : ''}`,
          );
        }
      }
      throw error;
    }
  }

  snapshot(): CircuitSnapshot {
    const now = this.now();
    this.prune(now);
    return {
      provider: this.name,
      state: this.state,
      failureCount: this.failures.length,
      lastFailureAt: this.failures.length > 0 ? new Date(this.failures[this.failures.length - 1]!).toISOString() : null,
      lastFailureCode: this.lastFailure?.code ?? null,
      lastFailureMessage: this.lastFailure?.message ?? null,
      lastFailureWasAuth: this.lastFailure?.auth ?? null,
      openedAt: this.openedAt !== null ? new Date(this.openedAt).toISOString() : null,
      nextProbeAt: this.nextProbeAt !== null ? new Date(this.nextProbeAt).toISOString() : null,
    };
  }

  private recordFailure(error: unknown, at: number): void {
    const e = error as { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown };
    this.lastFailure = {
      at,
      code: typeof e?.code === 'string' ? e.code : null,
      message: typeof e?.message === 'string' ? e.message.slice(0, 300) : 'unknown',
      auth: isAuthFailure(error),
    };
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    // Ring buffer of at most `threshold` entries: O(N) with N = 5.
    this.failures = this.failures.filter((t) => t > cutoff).slice(-this.threshold);
  }

  private open(now: number): void {
    this.state = 'open';
    this.openedAt = now;
    this.nextProbeAt = now + this.cooldownMs;
    this.probeInFlight = false;
  }

  private close(): void {
    const wasOpen = this.state !== 'closed';
    this.state = 'closed';
    this.failures = [];
    this.openedAt = null;
    this.nextProbeAt = null;
    this.probeInFlight = false;
    if (wasOpen) console.info(`[circuit] closed provider=${this.name}`);
  }
}

/**
 * Per-provider defaults. Generation providers trip fast and recover fast;
 * ElevenLabs/Lyria rate-limit hard, so a quick trip is correct there too.
 */
const PROVIDER_DEFAULTS: Record<string, { failureThreshold: number; failureWindowMs: number; cooldownMs: number }> = {
  fal:        { failureThreshold: 5, failureWindowMs: 60_000, cooldownMs: 30_000 },
  runpod:     { failureThreshold: 5, failureWindowMs: 60_000, cooldownMs: 30_000 },
  xai:        { failureThreshold: 5, failureWindowMs: 60_000, cooldownMs: 30_000 },
  kling:      { failureThreshold: 5, failureWindowMs: 60_000, cooldownMs: 30_000 },
  gemini:     { failureThreshold: 5, failureWindowMs: 60_000, cooldownMs: 30_000 },
  elevenlabs: { failureThreshold: 5, failureWindowMs: 60_000, cooldownMs: 30_000 },
  lyria:      { failureThreshold: 5, failureWindowMs: 60_000, cooldownMs: 30_000 },
};

/** The seven providers with breakers. Admin observability iterates this. */
export const BREAKER_PROVIDERS = ['fal', 'runpod', 'xai', 'kling', 'gemini', 'elevenlabs', 'lyria'] as const;

const registry = new Map<string, CircuitBreaker>();

export function breakerFor(provider: string): CircuitBreaker {
  const existing = registry.get(provider);
  if (existing) return existing;
  const defaults = PROVIDER_DEFAULTS[provider] ?? {
    failureThreshold: DEFAULT_THRESHOLD,
    failureWindowMs: DEFAULT_WINDOW_MS,
    cooldownMs: DEFAULT_COOLDOWN_MS,
  };
  const breaker = new CircuitBreaker({ name: provider, ...defaults });
  registry.set(provider, breaker);
  return breaker;
}

/** Snapshot of every registered breaker, in BREAKER_PROVIDERS order. */
export function allCircuitSnapshots(): CircuitSnapshot[] {
  return BREAKER_PROVIDERS.map((provider) => breakerFor(provider).snapshot());
}

/** Test seam — drops all breaker state. */
export function __resetCircuitBreakersForTests(): void {
  registry.clear();
}
