/**
 * MiniMax H3-Max Turbo — via fal.ai (`minimax/h3-max-turbo/image-to-video`).
 *
 * Image-to-video (opening frame → motion). Migrates the story I2V path onto
 * fal.ai. Uses the provider-neutral media layer; gated by the default-off
 * FAL_* config and throws PROVIDER_DISABLED when closed.
 *
 * Output is mirrored to R2.
 */

import { randomUUID } from 'node:crypto';
import { createFalMediaProvider, persistFalOutput, type MediaJobRef } from '../mediaProviders';
import { resultInvalid, storageFailed, type GenerationJobError, type GenerationJobState } from './jobModel';

const ENDPOINT = 'minimax/h3-max-turbo/image-to-video';
const PROVIDER_PREFIX = 'fal:';

export interface FalH3MaxInput {
  prompt:        string;
  seedImageUrl?: string;
  duration?:     number;
  resolution?:   string; // '480p' | '720p' | '768p' | '1080p' (provider preset)
  seed?:         number;
}

export interface FalH3MaxResult {
  jobId:      string;
  status:     GenerationJobState;
  outputUrl?: string;
  error?:     GenerationJobError;
}

export async function submitFalH3Max(input: FalH3MaxInput): Promise<string> {
  if (!input.seedImageUrl) {
    throw new Error(
      'MiniMax H3-Max is an image-to-video model and requires a seed image. ' +
      'Please provide a seed image or switch to a text-to-video model.',
    );
  }

  const provider = createFalMediaProvider();
  const ref = await provider.video!.submitVideo(
    {
      prompt:    input.prompt,
      imageUrl:  input.seedImageUrl,
      ...(typeof input.duration === 'number' ? { durationSeconds: input.duration } : {}),
      ...(input.resolution ? { resolution: input.resolution } : {}),
      ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
    },
    { idempotencyKey: `h3max:${randomUUID()}` },
  );
  return `${PROVIDER_PREFIX}${ref.requestId}`;
}

export async function getFalH3MaxStatus(jobId: string): Promise<FalH3MaxResult> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'video', requestId, idempotencyKey: '', model: ENDPOINT };

  const res = await provider.video!.getStatus(ref);
  if (res.status !== 'completed') {
    return { jobId, status: res.status, error: res.error };
  }

  const url = res.outputUrls[0];
  if (!url) {
    return { jobId, status: 'failed', error: resultInvalid() };
  }

  try {
    const permanentUrl = await persistFalOutput('video', requestId, url);
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch {
    return { jobId, status: 'failed', error: storageFailed() };
  }
}

export async function cancelFalH3Max(jobId: string): Promise<boolean> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'video', requestId, idempotencyKey: '', model: ENDPOINT };
  try {
    await provider.video!.cancel(ref);
    return true;
  } catch {
    return false;
  }
}
