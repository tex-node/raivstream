/**
 * Server-side validation + isolated-storage planning for provider artifacts.
 *
 * Never treats a provider CDN URL as a permanent Raivstream asset. Downloads
 * server-side, enforces content-type and size limits, and only plans uploads to
 * explicitly isolated (non-production) storage.
 */

import { MediaProviderError, isAcceptableResultUrl } from './types';

export const DEFAULT_ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export interface FetchValidateOptions {
  allowedContentTypes?: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ValidatedArtifact {
  buffer: Buffer;
  contentType: string;
  byteLength: number;
  sourceUrl: string;
}

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeContentType(value: string | null): string | null {
  if (!value) return null;
  const base = value.split(';')[0]?.trim().toLowerCase();
  return base && base.length > 0 ? base : null;
}

/** Downloads a provider artifact and enforces URL, HTTP, MIME, timeout, and size safety. */
export async function fetchAndValidateArtifact(
  sourceUrl: string,
  options: FetchValidateOptions = {},
): Promise<ValidatedArtifact> {
  if (!isAcceptableResultUrl(sourceUrl)) {
    throw new MediaProviderError('RESULT_INVALID', 'Provider returned a non-acceptable result URL');
  }
  const allowed = options.allowedContentTypes ?? DEFAULT_ALLOWED_IMAGE_TYPES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await doFetch(sourceUrl, { signal: controller.signal });
  } catch (err) {
    throw new MediaProviderError('TIMEOUT', `Provider artifact download failed: ${(err as Error).message}`, {
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new MediaProviderError('PROVIDER_ERROR', `Provider artifact download returned HTTP ${res.status}`, {
      retryable: res.status >= 500,
      providerStatus: res.status,
    });
  }

  const contentType = normalizeContentType(res.headers.get('content-type'));
  if (!contentType || !allowed.includes(contentType)) {
    throw new MediaProviderError('RESULT_INVALID', `Unsupported artifact content-type: ${contentType ?? 'unknown'}`);
  }

  const declaredLength = Number.parseInt(res.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new MediaProviderError('RESULT_INVALID', `Artifact exceeds size limit (${declaredLength} > ${maxBytes})`);
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await res.arrayBuffer());
  } catch {
    throw new MediaProviderError('RESULT_INVALID', 'Provider artifact body was malformed or unreadable');
  }
  if (buffer.byteLength === 0) {
    throw new MediaProviderError('RESULT_INVALID', 'Provider artifact was empty');
  }
  if (buffer.byteLength > maxBytes) {
    throw new MediaProviderError('RESULT_INVALID', `Artifact exceeds size limit (${buffer.byteLength} > ${maxBytes})`);
  }

  return { buffer, contentType, byteLength: buffer.byteLength, sourceUrl };
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

export function extensionForContentType(contentType: string): string {
  return EXTENSION_BY_TYPE[contentType] ?? 'bin';
}

/** Builds a deterministic isolated R2 key for a provider job artifact. */
export function buildIsolatedR2Key(prefix: string, provider: string, jobId: string, contentType: string): string {
  const safeJob = jobId.replace(/[^a-zA-Z0-9._-]/g, '-');
  const safePrefix = prefix.replace(/\/+$/, '');
  return `${safePrefix}/${provider}/${safeJob}.${extensionForContentType(contentType)}`;
}

export interface StorageIsolationEnv {
  FAL_USE_PRODUCTION_STORAGE?: string;
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_URL?: string;
}

/**
 * Fail-closed storage-isolation guard for the FAL staging path. Rejects when the
 * production-storage flag is enabled or staging R2 targeting is absent.
 */
export function assertIsolatedStorage(env: StorageIsolationEnv = process.env as StorageIsolationEnv): void {
  if ((env.FAL_USE_PRODUCTION_STORAGE ?? 'false') === 'true') {
    throw new MediaProviderError('STORAGE_FAILED', 'FAL_USE_PRODUCTION_STORAGE must remain false');
  }
  if (!env.R2_BUCKET_NAME || !env.R2_PUBLIC_URL) {
    throw new MediaProviderError('STORAGE_FAILED', 'Isolated staging R2 is not configured');
  }
}
