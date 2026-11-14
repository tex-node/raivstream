/**
 * Relight — a fal QUEUE adapter beside falFlux2Edit / falH3Max (2026-11-14).
 *
 * This is the only new code the transformation wiring needs. It adds **no transport**: it goes through
 * `createFalMediaProvider()`, the same queue client, the same contract set and the same
 * `persistFalOutput` as every other fal adapter, and it is disabled by exactly the same switches
 * (`readFalMediaConfig` / `isFalCapabilityLive`) - so an unswitched environment fails the way a missing
 * model does, not through a new error path.
 *
 * The endpoint is a required argument rather than a constant, because the relight endpoint has a verified
 * PRICE and an UNREAD contract (its queue schema 404s). Guessing the slug would be the migration-directory
 * mistake with a request body; the caller states it.
 */
import { randomUUID } from 'node:crypto';
import { createFalMediaProvider } from '../mediaProviders/fal/falMediaProvider';
import { persistFalOutput } from '../mediaProviders/fal/falStorage';
import type { MediaJobRef } from '../mediaProviders/types';

const PROVIDER_PREFIX = 'fal:relight:';

export interface FalRelightInput {
  endpointId: string;
  videoUrl: string;
  prompt: string;
  resolution: string;
}

interface VideoEditSubmitter {
  video: {
    submitVideo: (input: Record<string, unknown>, opts: { idempotencyKey: string }) => Promise<{ requestId: string }>;
    getStatus: (ref: MediaJobRef) => Promise<{ status: string; outputUrls?: string[]; error?: string }>;
  };
}

export async function submitFalRelight(input: FalRelightInput): Promise<string> {
  const provider = createFalMediaProvider() as unknown as VideoEditSubmitter;
  const ref = await provider.video.submitVideo(
    {
      endpointId: input.endpointId,
      videoUrl: input.videoUrl,
      videoUrls: [input.videoUrl],
      prompt: input.prompt,
      resolution: input.resolution,
    },
    { idempotencyKey: `relight:${randomUUID()}` },
  );
  return `${PROVIDER_PREFIX}${ref.requestId}`;
}

/** Poll a submitted relight to a permanent URL; mirrors getFalFlux2EditStatus. */
export async function getFalRelightStatus(jobId: string): Promise<{ status: string; outputUrl?: string; error?: string }> {
  const requestId = jobId.replace(/^fal:relight:/, '');
  const provider = createFalMediaProvider() as unknown as VideoEditSubmitter;
  const ref: MediaJobRef = { provider: 'fal', kind: 'video', requestId, idempotencyKey: '', model: 'relight' } as MediaJobRef;
  const res = await provider.video.getStatus(ref);
  if (res.status !== 'completed') return { status: res.status, ...(res.error ? { error: res.error } : {}) };
  const url = res.outputUrls?.[0];
  if (!url) return { status: 'failed', error: 'relight returned no output url' };
  const permanent = await persistFalOutput('video', requestId, url);
  return { status: 'completed', outputUrl: permanent };
}
