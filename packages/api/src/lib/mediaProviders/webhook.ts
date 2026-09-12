/**
 * Webhook verification + idempotency utilities for the media layer.
 *
 * Provider-agnostic: HMAC-SHA256 verification with timing-safe comparison and a
 * bounded in-memory idempotency store to absorb duplicate deliveries. The fal
 * provider's exact webhook signature scheme MUST be confirmed against current
 * fal documentation before enabling real calls; `verifyHmacSha256Signature`
 * covers the HMAC variant and a pluggable verifier hook is provided.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifySignatureOptions {
  /** Raw request body exactly as received (string or bytes). */
  payload: string | Buffer;
  /** Signature header value, e.g. "sha256=<hex>" or bare hex/base64. */
  signature: string | undefined | null;
  secret: string;
  /** Optional expected prefix (default accepts optional "sha256="). */
  prefix?: string;
}

function decodeSignature(signature: string, prefix?: string): Buffer | null {
  let value = signature.trim();
  if (prefix && value.startsWith(prefix)) value = value.slice(prefix.length);
  else if (value.startsWith('sha256=')) value = value.slice('sha256='.length);

  // hex first, then base64
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    return Buffer.from(value, 'hex');
  }
  try {
    return Buffer.from(value, 'base64');
  } catch {
    return null;
  }
}

/** Timing-safe HMAC-SHA256 signature verification. Returns false on any malformed input. */
export function verifyHmacSha256Signature(options: VerifySignatureOptions): boolean {
  const { payload, signature, secret, prefix } = options;
  if (!signature || !secret) return false;

  const provided = decodeSignature(signature, prefix);
  if (!provided || provided.length === 0) return false;

  const expected = createHmac('sha256', secret)
    .update(typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload)
    .digest();

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export type WebhookVerifier = (input: { payload: string | Buffer; headers: Record<string, string | undefined> }) => boolean;

/** Builds an idempotency key that is stable across duplicate deliveries. */
export function buildWebhookIdempotencyKey(provider: string, requestId: string, eventType: string): string {
  return `${provider}:${eventType}:${requestId}`;
}

export interface IdempotencyDecision {
  /** true when this key has not been seen (caller should process it). */
  isFirstDelivery: boolean;
}

/**
 * Bounded, TTL-based idempotency store. Intended to sit in front of webhook
 * handlers. A durable store should replace it before high-volume production use.
 */
export class WebhookIdempotencyStore {
  private readonly seen = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options?: { ttlMs?: number; maxEntries?: number }) {
    this.ttlMs = options?.ttlMs ?? 15 * 60 * 1000;
    this.maxEntries = options?.maxEntries ?? 5000;
  }

  private evict(now: number): void {
    for (const [key, at] of this.seen) {
      if (now - at > this.ttlMs) this.seen.delete(key);
    }
    if (this.seen.size > this.maxEntries) {
      const overflow = this.seen.size - this.maxEntries;
      let removed = 0;
      for (const key of this.seen.keys()) {
        this.seen.delete(key);
        if (++removed >= overflow) break;
      }
    }
  }

  /** Returns true if this is the first delivery for the key. */
  begin(key: string): boolean {
    const now = Date.now();
    this.evict(now);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now);
    return true;
  }

  has(key: string): boolean {
    return this.seen.has(key);
  }

  size(): number {
    return this.seen.size;
  }
}
