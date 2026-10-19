/**
 * D-076 — VEED Fabric input safety.
 *
 * Fabric takes no text prompt: the request is `image_url` + `audio_url` +
 * `resolution`. That makes the uploaded media the entire safety surface, and
 * until now nothing inspected it (the only moderation in `generation.create`
 * ran `if (input.prompt)`, which a Fabric client never sends).
 *
 * Gate order in `generation.create`:
 *   consent → file types → image moderation → audio duration → credits → submit
 *
 * Everything here is fail-open on infrastructure failure (`unknown` verdicts are
 * logged, never used to reject): a moderation outage must not take the feature
 * down. The one hard gate is consent, which is client-supplied and free.
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { TRPCError } from '@trpc/server';
import { moderateImage } from './contentScanner';

export const VEED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif'] as const;
export const VEED_AUDIO_EXTENSIONS = ['mp3', 'ogg', 'wav', 'm4a', 'aac'] as const;

/** Fabric caps audio at 1 minute; anything longer fails at the provider. */
export const VEED_MAX_AUDIO_SECONDS = 60;

const PROBE_TIMEOUT_MS = 5_000;
const FRAME_TIMEOUT_MS = 20_000;

/**
 * Extension of the URL *path*, ignoring query string and fragment.
 * R2/S3 URLs carry `?X-Amz-Signature=...`, so a naive `endsWith('.png')` check
 * rejects every signed URL.
 */
export function extensionOf(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const match = /\.([a-z0-9]+)$/i.exec(path);
    return match ? match[1]!.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Throws BAD_REQUEST for a disallowed image/audio extension. Pure — no I/O. */
export function assertVeedMediaTypes(seedImageUrl: string, audioUrl: string): void {
  const imageExt = extensionOf(seedImageUrl);
  if (!imageExt || !(VEED_IMAGE_EXTENSIONS as readonly string[]).includes(imageExt)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `VEED Fabric requires an image ending in one of: ${VEED_IMAGE_EXTENSIONS.join(', ')}.`,
    });
  }

  const audioExt = extensionOf(audioUrl);
  if (!audioExt || !(VEED_AUDIO_EXTENSIONS as readonly string[]).includes(audioExt)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `VEED Fabric requires audio ending in one of: ${VEED_AUDIO_EXTENSIONS.join(', ')}.`,
    });
  }
}

/**
 * SHA-256 of the URL, not the bytes.
 *
 * LIMITATION: a URL is not the media. The same host can serve different bytes
 * later, and the same bytes can move. The audit trail records `hashKind: 'url'`
 * so nobody mistakes this for a content fingerprint. Hashing fetched bytes would
 * be stronger but doubles the download cost on every request.
 */
export function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

function runCapture(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve(null);
      return;
    }

    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      resolve(null);
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && chunks.length > 0 ? Buffer.concat(chunks) : null);
    });
  });
}

/** ffprobe a remote URL. Returns null on timeout/failure (caller fails open). */
export async function probeRemoteAudioSeconds(url: string): Promise<number | null> {
  const out = await runCapture(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', url],
    PROBE_TIMEOUT_MS,
  );
  if (!out) return null;
  const seconds = Number.parseFloat(out.toString().trim());
  return Number.isFinite(seconds) ? seconds : null;
}

/** First frame of a remote video as JPEG bytes (for the best-effort output scan). */
export async function extractFirstFrameJpeg(videoUrl: string): Promise<Buffer | null> {
  return runCapture(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-ss', '0', '-i', videoUrl, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'],
    FRAME_TIMEOUT_MS,
  );
}

export interface VeedAuditEntry {
  userId: string;
  jobId: string;
  imageHash: string;
  audioHash: string;
  hashKind: 'url';
  consent: true;
  consentAt: string;
  verdict: 'allowed' | 'flagged' | 'rejected' | 'unknown';
  reason?: string;
  detail?: string;
}

/** Structured audit line — the audit trail for now (no DB table in D-076). */
export function logVeedAudit(entry: VeedAuditEntry): void {
  console.info('[veed.audit]', JSON.stringify(entry));
}

export interface VeedGateResult {
  image: 'allowed' | 'unknown';
  audioSeconds: number | null;
}

export interface VeedGateDeps {
  moderateImage: typeof moderateImage;
  probe: (url: string) => Promise<number | null>;
  log: (entry: VeedAuditEntry) => void;
}

const defaultGateDeps: VeedGateDeps = {
  moderateImage,
  probe: probeRemoteAudioSeconds,
  log: logVeedAudit,
};

/**
 * The full Fabric gate, in order: consent → file types → image → audio.
 *
 * Extracted from the router so the ORDER is testable — the expensive mistake
 * would be moderating after charging, or charging after a rejected image.
 * Throws TRPCError for every rejection, so nothing downstream runs.
 */
let gateDepsOverride: Partial<VeedGateDeps> | null = null;

/**
 * Test seam: substitute the gate's I/O (image moderator, ffprobe) without
 * replacing the gate itself — so tests exercise the real ordering logic while a
 * router wiring test can still drive `generation.create` end to end.
 */
export function __setVeedGateDepsForTests(deps: Partial<VeedGateDeps> | null): void {
  gateDepsOverride = deps;
}

export async function gateVeedFabricInputs(
  input: { consent?: boolean; seedImageUrl: string; audioUrl: string; userId: string },
  deps: Partial<VeedGateDeps> = {},
): Promise<VeedGateResult> {
  const d: VeedGateDeps = { ...defaultGateDeps, ...(gateDepsOverride ?? {}), ...deps };

  // 1. Consent — cheapest gate, no I/O.
  if (input.consent !== true) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Consent attestation is required for VEED Fabric.',
    });
  }

  // 2. File types — no I/O.
  assertVeedMediaTypes(input.seedImageUrl, input.audioUrl);

  // 3. Image moderation. `unknown` (API down) passes: fail-open.
  const verdict = await d.moderateImage({ url: input.seedImageUrl });
  if (verdict.verdict === 'flagged') {
    d.log({
      userId: input.userId,
      jobId: 'pre-create',
      imageHash: hashUrl(input.seedImageUrl),
      audioHash: hashUrl(input.audioUrl),
      hashKind: 'url',
      consent: true,
      consentAt: new Date().toISOString(),
      verdict: 'rejected',
      reason: verdict.reason,
    });
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'CONTENT_REJECTED: the presenter image violates our content guidelines.',
    });
  }

  // 4. Audio duration. Null (probe failed) passes and is logged as unknown.
  const audioSeconds = await d.probe(input.audioUrl);
  if (audioSeconds !== null && audioSeconds > VEED_MAX_AUDIO_SECONDS) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `VEED Fabric audio must be ${VEED_MAX_AUDIO_SECONDS}s or shorter (received ${Math.round(audioSeconds)}s).`,
    });
  }

  return { image: verdict.verdict === 'allowed' ? 'allowed' : 'unknown', audioSeconds };
}

/**
 * Best-effort output scan: first frame of the rendered talking-video through the
 * image moderator. Logged, never blocking — the job is already COMPLETED and
 * paid for by the time this runs, so a failure here can only inform review.
 */
export async function scanVeedFabricOutput(input: {
  videoUrl: string | null;
  jobId: string;
  userId: string;
}): Promise<void> {
  if (!input.videoUrl) return;

  try {
    const frame = await extractFirstFrameJpeg(input.videoUrl);
    if (!frame) {
      console.warn('[veed.audit] output-scan', JSON.stringify({
        jobId: input.jobId, verdict: 'unknown', reason: 'frame extraction failed',
      }));
      return;
    }

    const verdict = await moderateImage({
      dataUrl: `data:image/jpeg;base64,${frame.toString('base64')}`,
    });

    console.info('[veed.audit] output-scan', JSON.stringify({
      jobId: input.jobId,
      userId: input.userId,
      verdict: verdict.verdict,
      reason: verdict.reason,
      categories: verdict.categories,
    }));
  } catch (error) {
    console.warn('[veed.audit] output-scan failed:', (error as Error).message);
  }
}
