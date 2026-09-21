/**
 * FLUX.2 (Black Forest Labs) — via fal.ai (`fal-ai/flux-2`).
 *
 * Text-to-image. Migrates the image path off RunPod's Flux.1 Dev onto fal.ai.
 * Uses the provider-neutral media layer (see `lib/mediaProviders`); the real
 * fal call is gated by the default-off FAL_* config and throws PROVIDER_DISABLED
 * when closed, so this adapter is inert until the switches are enabled.
 *
 * Output is mirrored to R2 so the fal.media URL is never persisted as a
 * permanent asset.
 */

import { randomUUID } from 'node:crypto';
import { createFalMediaProvider, persistFalOutput, type MediaJobRef } from '../mediaProviders';
import { resultInvalid, storageFailed, type GenerationJobError, type GenerationJobState } from './jobModel';

const ENDPOINT = 'fal-ai/flux-2';
const PROVIDER_PREFIX = 'fal:';

export interface FalFlux2Input {
  prompt:       string;
  aspectRatio?: string;
  seed?:        number;
}

export interface FalFlux2Result {
  jobId:      string;
  status:     GenerationJobState;
  outputUrl?: string;
  error?:     GenerationJobError;
}

export async function submitFalFlux2(input: FalFlux2Input): Promise<string> {
  const provider = createFalMediaProvider();
  const ref = await provider.image!.submitImage(
    {
      prompt:      input.prompt,
      aspectRatio: (input.aspectRatio ?? '9:16') as '9:16' | '16:9' | '1:1' | '4:3' | '3:4',
      ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
    },
    { idempotencyKey: `flux2:${randomUUID()}` },
  );
  return `${PROVIDER_PREFIX}${ref.requestId}`;
}

export async function getFalFlux2Status(jobId: string): Promise<FalFlux2Result> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'image', requestId, idempotencyKey: '', model: ENDPOINT };

  const res = await provider.image!.getStatus(ref);
  if (res.status !== 'completed') {
    return { jobId, status: res.status, error: res.error };
  }

  const url = res.outputUrls[0];
  if (!url) {
    return { jobId, status: 'failed', error: resultInvalid() };
  }

  try {
    const permanentUrl = await persistFalOutput('image', requestId, url);
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch {
    return { jobId, status: 'failed', error: storageFailed() };
  }
}

export async function cancelFalFlux2(jobId: string): Promise<boolean> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'image', requestId, idempotencyKey: '', model: ENDPOINT };
  try {
    await provider.image!.cancel(ref);
    return true;
  } catch {
    return false;
  }
}
