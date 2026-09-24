/**
 * fal.ai media adapter — server-only scaffolding.
 *
 * REAL CALLS ARE DISABLED BY DEFAULT. Every submission is gated by
 * `readFalMediaConfig()` + `isFalCapabilityLive()`; with the shipped defaults
 * (all switches false, FAL_MAX_REQUESTS=0) this adapter throws
 * `PROVIDER_DISABLED` without touching the network.
 *
 * Uses the official `@fal-ai/client` (queue API) via a lazy dynamic import so
 * the SDK is never loaded in the disabled state. Never import this from client
 * components. FAL_KEY is read only inside the transport, server-side.
 */

import {
  falDisabledReason,
  isFalCapabilityLive,
  isFalEndpointAllowed,
  readFalMediaConfig,
  type FalMediaConfig,
} from '../config';
import {
  MediaProviderError,
  type ImageGenerationInput,
  type ImageGenerationProvider,
  type MediaJobRef,
  type MediaJobStatusResult,
  type MediaKind,
  type MediaJobStatus,
  type MediaProvider,
  type MediaProviderCapabilities,
  type SubmitMediaOptions,
  type UGCVideoInput,
  type UGCVideoProvider,
  type VideoGenerationInput,
  type VideoGenerationProvider,
} from '../types';
import {
  parseFlux2Output,
  parseH3MaxOutput,
  parseVeedFabricOutput,
  toFlux2Input,
  toFluxKontextInput,
  toH3MaxInput,
  toVeedFabricInput,
} from './contracts';

// ─── Transport (injectable for tests; replaces the SDK entirely) ──────────────

export interface FalQueueTransport {
  submit(endpoint: string, input: Record<string, unknown>, options: { webhookUrl?: string }): Promise<string>;
  status(endpoint: string, requestId: string): Promise<{ status: string; error?: string }>;
  result(endpoint: string, requestId: string): Promise<unknown>;
  cancel(endpoint: string, requestId: string): Promise<void>;
}

type FalLike = {
  config(config: { credentials: string }): void;
  queue: {
    submit(endpoint: string, options: { input: Record<string, unknown>; webhookUrl?: string }): Promise<{ request_id: string }>;
    status(endpoint: string, options: { requestId: string; logs?: boolean }): Promise<{ status: string; error?: string }>;
    result(endpoint: string, options: { requestId: string }): Promise<{ data?: unknown; requestId?: string }>;
    cancel(endpoint: string, options: { requestId: string }): Promise<void>;
  };
};

export function createDefaultFalQueueTransport(): FalQueueTransport {
  let configured = false;

  async function getFal(): Promise<FalLike> {
    const mod = await import('@fal-ai/client');
    const fal = (mod as unknown as { fal: FalLike }).fal;
    if (!configured) {
      const credentials = process.env.FAL_KEY;
      if (!credentials) throw new MediaProviderError('PROVIDER_NOT_CONFIGURED', 'FAL_KEY is not set');
      fal.config({ credentials });
      configured = true;
    }
    return fal;
  }

  return {
    async submit(endpoint, input, options) {
      const fal = await getFal();
      const res = await fal.queue.submit(endpoint, {
        input,
        ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
      });
      return res.request_id;
    },
    async status(endpoint, requestId) {
      const fal = await getFal();
      const res = await fal.queue.status(endpoint, { requestId });
      return { status: res.status, error: res.error };
    },
    async result(endpoint, requestId) {
      const fal = await getFal();
      const res = await fal.queue.result(endpoint, { requestId });
      return res.data;
    },
    async cancel(endpoint, requestId) {
      const fal = await getFal();
      await fal.queue.cancel(endpoint, { requestId });
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeFalQueueStatus(raw: string): MediaJobStatus {
  switch (raw) {
    case 'IN_QUEUE':
      return 'queued';
    case 'IN_PROGRESS':
      return 'generating';
    case 'COMPLETED':
      return 'completed';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'generating';
  }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

interface FalProviderDeps {
  config?: FalMediaConfig;
  transport?: FalQueueTransport;
}

export function createFalMediaProvider(deps: FalProviderDeps = {}): MediaProvider {
  const config = deps.config ?? readFalMediaConfig();
  const transport = deps.transport ?? createDefaultFalQueueTransport();
  let requestCount = 0;

  function assertLive(kind: 'image' | 'imageCond' | 'video' | 'ugc'): void {
    if (!isFalCapabilityLive(config, kind)) {
      throw new MediaProviderError('PROVIDER_DISABLED', `fal ${kind} disabled: ${falDisabledReason(config, kind)}`);
    }
    if (requestCount >= config.maxRequests) {
      throw new MediaProviderError('RATE_LIMITED', `fal request cap reached (${config.maxRequests})`);
    }
  }

  function assertEndpoint(endpoint: string): void {
    if (!isFalEndpointAllowed(endpoint, config)) {
      throw new MediaProviderError('UNSUPPORTED', `Endpoint not on fal allowlist: ${endpoint}`);
    }
  }

  function refOf(kind: MediaKind, endpoint: string, requestId: string, options: SubmitMediaOptions): MediaJobRef {
    return { provider: 'fal', kind, requestId, idempotencyKey: options.idempotencyKey, model: endpoint };
  }

  async function guardedSubmit(
    kind: 'image' | 'video' | 'ugc',
    endpoint: string,
    input: Record<string, unknown>,
    options: SubmitMediaOptions,
  ): Promise<string> {
    try {
      return await transport.submit(endpoint, input, { webhookUrl: options.webhookUrl });
    } catch (err) {
      // FAL returns HTTP 403 in two distinct cases:
      //   a) "User is locked. Reason: Exhausted balance." → permanent until funded → non-retryable
      //   b) Transient propagation lag after a top-up, or rate-gate → retryable
      // The @fal-ai/client SDK throws ApiError with .status=403 and .body containing the
      // parsed JSON (e.g. { detail: "User is locked. Reason: Exhausted balance…" }).
      // Only the "locked" variant should be classified as PROVIDER_DISABLED; other
      // 403s should remain as plain errors so the runner can retry them.
      if (err instanceof Error && (err as { status?: unknown }).status === 403) {
        const detail = String((err as { body?: { detail?: unknown } }).body?.detail ?? '');
        const isBalanceLocked = detail.includes('locked') || detail.includes('Exhausted');
        if (isBalanceLocked) {
          throw new MediaProviderError(
            'PROVIDER_DISABLED',
            `fal ${kind} disabled: account locked or balance exhausted (HTTP 403)`,
            { retryable: false, providerStatus: 403 },
          );
        }
      }
      throw err;
    }
  }

  function parseByKind(kind: MediaKind, raw: unknown, model?: string): MediaJobStatusResult {
    // imageCond (Kontext) and image (FLUX2) share the same output shape — both return images[].
    const isKontext = model === 'fal-ai/flux-pro/kontext';
    const parsed =
      kind === 'image' || isKontext
        ? parseFlux2Output(raw)
        : kind === 'video'
          ? parseH3MaxOutput(raw)
          : parseVeedFabricOutput(raw);
    return { status: 'completed', outputUrls: parsed.urls, artifacts: parsed.media, usage: parsed.usage, raw };
  }

  async function statusFor(ref: MediaJobRef, endpoint: string): Promise<MediaJobStatusResult> {
    const remote = await transport.status(endpoint, ref.requestId);
    const status = normalizeFalQueueStatus(remote.status);
    if (status !== 'completed') {
      return {
        status,
        outputUrls: [],
        ...(remote.error ? { error: { code: 'PROVIDER_ERROR', message: remote.error, retryable: false } } : {}),
      };
    }
    let raw: unknown;
    try {
      raw = await transport.result(endpoint, ref.requestId);
    } catch (err) {
      // Worker-level errors (e.g. "Path not found" for a wrong model identifier) arrive here
      // after a successful queue submission. Surface as non-retryable so the runner does not
      // waste a second attempt on a permanent configuration error.
      throw new MediaProviderError(
        'PROVIDER_ERROR',
        err instanceof Error ? err.message : 'Result fetch failed',
        { retryable: false },
      );
    }
    return parseByKind(ref.kind, raw, endpoint);
  }

  const image: ImageGenerationProvider = {
    name: 'fal',
    kind: 'image',
    async submitImage(input: ImageGenerationInput, options: SubmitMediaOptions): Promise<MediaJobRef> {
      assertLive('image');
      const endpoint = config.endpoints.image;
      assertEndpoint(endpoint);
      const requestId = await guardedSubmit('image', endpoint, toFlux2Input(input), options);
      requestCount += 1;
      return refOf('image', endpoint, requestId, options);
    },
    async getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult> {
      if (ref.kind !== 'image') throw new MediaProviderError('INVALID_REQUEST', 'ref is not an image job');
      return statusFor(ref, ref.model ?? config.endpoints.image);
    },
    async cancel(ref: MediaJobRef): Promise<void> {
      await transport.cancel(ref.model ?? config.endpoints.image, ref.requestId);
    },
  };

  const video: VideoGenerationProvider = {
    name: 'fal',
    kind: 'video',
    async submitVideo(input: VideoGenerationInput, options: SubmitMediaOptions): Promise<MediaJobRef> {
      assertLive('video');
      const endpoint = config.endpoints.video;
      assertEndpoint(endpoint);
      const requestId = await guardedSubmit('video', endpoint, toH3MaxInput(input), options);
      requestCount += 1;
      return refOf('video', endpoint, requestId, options);
    },
    async getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult> {
      if (ref.kind !== 'video') throw new MediaProviderError('INVALID_REQUEST', 'ref is not a video job');
      return statusFor(ref, ref.model ?? config.endpoints.video);
    },
    async cancel(ref: MediaJobRef): Promise<void> {
      await transport.cancel(ref.model ?? config.endpoints.video, ref.requestId);
    },
  };

  const imageCond: ImageGenerationProvider = {
    name: 'fal',
    kind: 'image',
    async submitImage(input: ImageGenerationInput, options: SubmitMediaOptions): Promise<MediaJobRef> {
      assertLive('imageCond');
      const endpoint = config.endpoints.imageCond;
      assertEndpoint(endpoint);
      const requestId = await guardedSubmit('image', endpoint, toFluxKontextInput(input), options);
      requestCount += 1;
      return refOf('image', endpoint, requestId, options);
    },
    async getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult> {
      if (ref.kind !== 'image') throw new MediaProviderError('INVALID_REQUEST', 'ref is not an image job');
      return statusFor(ref, ref.model ?? config.endpoints.imageCond);
    },
    async cancel(ref: MediaJobRef): Promise<void> {
      await transport.cancel(ref.model ?? config.endpoints.imageCond, ref.requestId);
    },
  };

  const ugc: UGCVideoProvider = {
    name: 'fal',
    kind: 'ugc_video',
    async submitUGC(input: UGCVideoInput, options: SubmitMediaOptions): Promise<MediaJobRef> {
      assertLive('ugc');
      const endpoint = config.endpoints.ugc;
      assertEndpoint(endpoint);
      const requestId = await guardedSubmit('ugc', endpoint, toVeedFabricInput(input), options);
      requestCount += 1;
      return refOf('ugc_video', endpoint, requestId, options);
    },
    async getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult> {
      if (ref.kind !== 'ugc_video') throw new MediaProviderError('INVALID_REQUEST', 'ref is not a UGC job');
      return statusFor(ref, ref.model ?? config.endpoints.ugc);
    },
    async cancel(ref: MediaJobRef): Promise<void> {
      await transport.cancel(ref.model ?? config.endpoints.ugc, ref.requestId);
    },
  };

  const capabilities: MediaProviderCapabilities[] = [
    { kind: 'image', enabled: isFalCapabilityLive(config, 'image'), reason: falDisabledReason(config, 'image') },
    { kind: 'image', enabled: isFalCapabilityLive(config, 'imageCond'), reason: falDisabledReason(config, 'imageCond') },
    { kind: 'video', enabled: isFalCapabilityLive(config, 'video'), reason: falDisabledReason(config, 'video') },
    { kind: 'ugc_video', enabled: isFalCapabilityLive(config, 'ugc'), reason: falDisabledReason(config, 'ugc') },
  ];

  return { name: 'fal', capabilities, image, imageCond, video, ugc };
}
