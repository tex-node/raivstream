/**
 * POST /api/webhooks/fal
 *
 * fal.ai queue completion webhook (staging-compatible, server-only).
 *
 * Security:
 *   - The RAW request body is verified with the fal ED25519/JWKS signature
 *     before the payload is parsed or acted upon.
 *   - Missing / malformed / stale / invalid signatures are rejected.
 *   - The route is inert (503) unless FAL_MEDIA_PROVIDER_ENABLED is explicitly
 *     true, so it cannot affect production while the migration is disabled.
 *   - No headers, signatures, tokens, payloads, or credentials are logged.
 *
 * Idempotency is durable and DB-backed (see processProviderWebhook): duplicate,
 * replayed, or out-of-order deliveries are harmless no-ops.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@raivstream/database';
import type { PrismaClient } from '@raivstream/database';
import {
  falProviderJobKey,
  fetchFalJwks,
  isAcceptableResultUrl,
  processProviderWebhook,
  verifyFalWebhookSignature,
} from '@raivstream/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractImageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const images = (payload as { images?: unknown }).images;
  if (!Array.isArray(images)) return null;
  for (const image of images) {
    const url = (image as { url?: unknown })?.url;
    if (isAcceptableResultUrl(url)) return url;
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.FAL_MEDIA_PROVIDER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not enabled' }, { status: 503 });
  }

  const rawBody = await req.text();

  let jwks;
  try {
    jwks = await fetchFalJwks();
  } catch {
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 503 });
  }

  const valid = verifyFalWebhookSignature({
    headers: {
      requestId: req.headers.get('x-fal-webhook-request-id'),
      userId: req.headers.get('x-fal-webhook-user-id'),
      timestamp: req.headers.get('x-fal-webhook-timestamp'),
      signature: req.headers.get('x-fal-webhook-signature'),
    },
    rawBody,
    jwks,
  });
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { request_id?: string; status?: string; error?: string; payload?: unknown };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const requestId = typeof event.request_id === 'string' ? event.request_id : null;
  if (!requestId) {
    return NextResponse.json({ received: true });
  }

  const succeeded = event.status === 'OK';
  try {
    await processProviderWebhook(prisma as unknown as PrismaClient, {
      providerJobId: falProviderJobKey(requestId),
      outcome: succeeded ? 'completed' : 'failed',
      outputUrl: succeeded ? extractImageUrl(event.payload) : null,
      errorMessage: succeeded ? null : (event.error ?? 'Provider reported failure'),
    });
  } catch {
    // Do not leak internals; non-2xx lets fal retry within its bounded policy.
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
