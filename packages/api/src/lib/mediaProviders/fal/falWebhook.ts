/**
 * fal.ai webhook signature verification (ED25519 / JWKS).
 *
 * Reconciled 2026-09-12 against official fal docs:
 *   https://fal.ai/docs/documentation/model-apis/inference/webhooks
 *
 * fal does NOT use HMAC. The signature is ED25519 over:
 *   `${X-Fal-Webhook-Request-Id}\n${X-Fal-Webhook-User-Id}\n${X-Fal-Webhook-Timestamp}\n${sha256hex(rawBody)}`
 * verified against public keys from https://rest.fal.ai/.well-known/jwks.json
 * (JWKS may be cached ≤24h). Timestamp must be within ±300s to prevent replay.
 *
 * Uses only Node's built-in crypto (no libsodium dependency). Never logs
 * signatures, keys, or body content.
 */

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

const FAL_JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const DEFAULT_TOLERANCE_SECONDS = 300;

export interface FalJwk {
  x: string;
}

export interface FalWebhookHeaders {
  requestId?: string | null;
  userId?: string | null;
  timestamp?: string | null;
  signature?: string | null;
}

export interface VerifyFalWebhookOptions {
  headers: FalWebhookHeaders;
  rawBody: string | Buffer;
  jwks: FalJwk[];
  /** Injectable clock for tests (unix seconds). */
  nowSeconds?: number;
  toleranceSeconds?: number;
}

function buildMessage(headers: Required<Pick<FalWebhookHeaders, 'requestId' | 'userId' | 'timestamp'>>, rawBody: string | Buffer): Buffer {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return Buffer.from([headers.requestId, headers.userId, headers.timestamp, bodyHash].join('\n'), 'utf8');
}

/** Verifies a fal webhook signature. Returns false on any malformed/missing/expired input. */
export function verifyFalWebhookSignature(options: VerifyFalWebhookOptions): boolean {
  const { headers, rawBody, jwks } = options;
  const requestId = headers.requestId ?? undefined;
  const userId = headers.userId ?? undefined;
  const timestamp = headers.timestamp ?? undefined;
  const signature = headers.signature ?? undefined;
  if (!requestId || !userId || !timestamp || !signature) return false;
  if (!Array.isArray(jwks) || jwks.length === 0) return false;

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - ts) > tolerance) return false;

  if (!/^[0-9a-fA-F]+$/.test(signature) || signature.length % 2 !== 0) return false;
  const signatureBytes = Buffer.from(signature, 'hex');
  if (signatureBytes.length === 0) return false;

  const message = buildMessage({ requestId, userId, timestamp }, rawBody);

  for (const jwk of jwks) {
    try {
      if (!jwk || typeof jwk.x !== 'string') continue;
      const rawPublicKey = Buffer.from(jwk.x, 'base64url');
      if (rawPublicKey.length !== 32) continue;
      const keyObject = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
        format: 'der',
        type: 'spki',
      });
      if (cryptoVerify(null, message, keyObject, signatureBytes)) return true;
    } catch {
      // try the next key
    }
  }
  return false;
}

// ─── JWKS fetch with bounded cache ────────────────────────────────────────────

let jwksCache: { keys: FalJwk[]; at: number } | null = null;

export async function fetchFalJwks(deps?: {
  fetchImpl?: typeof fetch;
  now?: number;
  maxAgeMs?: number;
  url?: string;
}): Promise<FalJwk[]> {
  const now = deps?.now ?? Date.now();
  const maxAgeMs = deps?.maxAgeMs ?? 24 * 60 * 60 * 1000;
  if (jwksCache && now - jwksCache.at < maxAgeMs) return jwksCache.keys;

  const doFetch = deps?.fetchImpl ?? fetch;
  const res = await doFetch(deps?.url ?? FAL_JWKS_URL);
  if (!res.ok) throw new Error(`fal JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys?: FalJwk[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache = { keys, at: now };
  return keys;
}

export function __resetFalJwksCacheForTests(): void {
  jwksCache = null;
}
