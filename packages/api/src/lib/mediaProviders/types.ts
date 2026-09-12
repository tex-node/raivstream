/**
 * Provider-neutral media layer — normalized contracts.
 *
 * This is the ONLY interface application code should use for image, video, and
 * UGC (talking-person) generation. Provider-specific request/response schemas
 * (e.g. fal.ai) must never leak into story routers, UI, or business logic.
 *
 * Foundation only: no live provider calls. See `config.ts` for the default-off
 * gate and `fal/falMediaProvider.ts` for the fal adapter scaffolding.
 */

export type MediaKind = 'image' | 'video' | 'ugc_video';

export type MediaJobStatus = 'queued' | 'generating' | 'completed' | 'failed' | 'cancelled';

export type MediaErrorCode =
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'INVALID_REQUEST'
  | 'UNSAFE_REQUEST'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'PROVIDER_ERROR'
  | 'RESULT_INVALID'
  | 'STORAGE_FAILED'
  | 'DUPLICATE'
  | 'UNSUPPORTED';

export interface NormalizedMediaError {
  code: MediaErrorCode;
  message: string;
  retryable: boolean;
  providerStatus?: number;
}

/** Thrown by adapters for all provider-neutral failures. Never carries secrets. */
export class MediaProviderError extends Error {
  readonly code: MediaErrorCode;
  readonly retryable: boolean;
  readonly providerStatus?: number;

  constructor(code: MediaErrorCode, message: string, options?: { retryable?: boolean; providerStatus?: number }) {
    super(message);
    this.name = 'MediaProviderError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.providerStatus = options?.providerStatus;
  }

  toNormalized(): NormalizedMediaError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.providerStatus !== undefined ? { providerStatus: this.providerStatus } : {}),
    };
  }
}

/** Provider-specific usage/cost metadata. Never surfaced to R16/user UI. */
export interface MediaUsage {
  provider?: string;
  model?: string;
  costUsd?: number;
  billableUnits?: number;
  metrics?: Record<string, number | string>;
}

export interface MediaJobRef {
  provider: string;
  kind: MediaKind;
  requestId: string;
  idempotencyKey: string;
  model?: string;
}

/** Describes a single generated file before Raivstream storage persistence. */
export interface MediaArtifact {
  url: string;
  contentType?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

export interface MediaJobStatusResult {
  status: MediaJobStatus;
  /** Permanent-provider or storage URLs; empty until completed. */
  outputUrls: string[];
  /** Provider file metadata for server-side storage handling. Never send to clients. */
  artifacts?: MediaArtifact[];
  error?: NormalizedMediaError;
  usage?: MediaUsage;
  /** Raw provider payload for diagnostics server-side only. Never send to clients. */
  raw?: unknown;
}

export interface SubmitMediaOptions {
  /** Stable key so duplicate submissions do not create duplicate jobs/charges. */
  idempotencyKey: string;
  /** Preferred completion mechanism; provider falls back to polling when absent. */
  webhookUrl?: string;
  timeoutMs?: number;
}

export type { SubmitMediaOptions as MediaSubmitOptions };

// ─── Normalized inputs ────────────────────────────────────────────────────────

export interface ImageGenerationInput {
  prompt: string;
  negativePrompt?: string;
  /** Optional input/reference images for editing or reference conditioning. */
  imageUrls?: string[];
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
  /** Optional explicit pixel size (adapter may prefer aspectRatio). */
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
}

export interface VideoGenerationInput {
  prompt: string;
  /** Opening frame (image-to-video). */
  imageUrl: string;
  /** Optional ending frame. */
  endImageUrl?: string;
  durationSeconds?: number;
  resolution?: string;
  seed?: number;
  /** Provider-specific prompt expansion toggle, normalized. */
  promptExpansion?: boolean;
  model?: string;
}

export interface UGCVideoInput {
  /** Presenter image (uploaded photo or a generated image). */
  imageUrl: string;
  /** Audio/speech track to lip-sync against. */
  audioUrl: string;
  resolution?: string;
  model?: string;
}

// ─── Provider interfaces ──────────────────────────────────────────────────────

export interface MediaProviderCapabilities {
  kind: MediaKind;
  /** Whether this provider/account is enabled for the capability right now. */
  enabled: boolean;
  reason?: string;
}

export interface ImageGenerationProvider {
  readonly name: string;
  readonly kind: 'image';
  submitImage(input: ImageGenerationInput, options: SubmitMediaOptions): Promise<MediaJobRef>;
  getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult>;
  cancel(ref: MediaJobRef): Promise<void>;
}

export interface VideoGenerationProvider {
  readonly name: string;
  readonly kind: 'video';
  submitVideo(input: VideoGenerationInput, options: SubmitMediaOptions): Promise<MediaJobRef>;
  getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult>;
  cancel(ref: MediaJobRef): Promise<void>;
}

export interface UGCVideoProvider {
  readonly name: string;
  readonly kind: 'ugc_video';
  submitUGC(input: UGCVideoInput, options: SubmitMediaOptions): Promise<MediaJobRef>;
  getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult>;
  cancel(ref: MediaJobRef): Promise<void>;
}

/** A provider that can serve any subset of the three media capabilities. */
export interface MediaProvider {
  readonly name: string;
  readonly capabilities: MediaProviderCapabilities[];
  readonly image?: ImageGenerationProvider;
  readonly video?: VideoGenerationProvider;
  readonly ugc?: UGCVideoProvider;
}

/** Result URL validation — only http(s) provider/storage URLs are accepted. */
export function isAcceptableResultUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Maps any unknown thrown value into a provider-neutral error. */
export function toMediaProviderError(error: unknown): MediaProviderError {
  if (error instanceof MediaProviderError) return error;
  const message = error instanceof Error ? error.message : 'Unknown provider error';
  return new MediaProviderError('PROVIDER_ERROR', message, { retryable: true });
}
