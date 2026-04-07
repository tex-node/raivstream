/**
 * POST /api/webhooks/transcode
 *
 * Receives a callback from the external FFmpeg worker when async transcoding
 * completes (or fails). The worker POSTs a JSON body signed with
 * TRANSCODE_WORKER_SECRET (a shared HMAC-SHA256 secret).
 *
 * Expected body shape:
 * {
 *   videoId:      string          // Raivstream video ID
 *   status:       'complete' | 'error'
 *   mp4Url?:      string          // CDN URL of the re-encoded MP4
 *   hlsMasterUrl?: string         // CDN URL of the HLS master playlist
 *   errorMessage?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@raivstream/database';

const WORKER_SECRET = process.env.TRANSCODE_WORKER_SECRET ?? '';

function verifySignature(body: string, signatureHeader: string | null): boolean {
  if (!WORKER_SECRET || !signatureHeader) return false;
  const expected = createHmac('sha256', WORKER_SECRET).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify the request comes from our worker
  const sig = req.headers.get('x-transcode-signature');
  if (!verifySignature(rawBody, sig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: {
    videoId: string;
    status: 'complete' | 'error';
    mp4Url?: string;
    hlsMasterUrl?: string;
    errorMessage?: string;
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { videoId, status, mp4Url, hlsMasterUrl, errorMessage } = payload;

  if (!videoId) {
    return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
  }

  if (status === 'complete') {
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'READY',
        ...(mp4Url ? { mp4Url } : {}),
        ...(hlsMasterUrl ? { hlsMasterUrl } : {}),
      },
    });
    console.log(`[transcode webhook] Video ${videoId} is READY — mp4: ${mp4Url}, hls: ${hlsMasterUrl}`);
  } else {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'FAILED' },
    });
    console.error(`[transcode webhook] Video ${videoId} FAILED — ${errorMessage}`);
  }

  return NextResponse.json({ ok: true });
}
