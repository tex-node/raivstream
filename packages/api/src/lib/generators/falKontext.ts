/**
 * FLUX Pro Kontext — via fal.ai (`fal-ai/flux-pro/kontext`).
 *
 * Image-conditioned generation: takes a source/reference image + prompt and
 * produces output images that preserve the subject identity from the source
 * while placing it in the scene described by the prompt. This is the fix for
 * Raivstream's source fidelity gap — FLUX.2 is text-to-image only and cannot
 * condition on a product photo; Kontext can.
 *
 * Gated by FAL_IMAGE_COND_ENABLED (default off). The provider throws
 * PROVIDER_DISABLED when the gate is closed, so this adapter is inert until
 * that env var is enabled.
 */

import { randomUUID } from 'node:crypto';
import { createFalMediaProvider, persistFalOutput, type MediaJobRef } from '../mediaProviders';
import { resultInvalid, storageFailed, type GenerationJobError, type GenerationJobState } from './jobModel';

const ENDPOINT = 'fal-ai/flux-pro/kontext';
const PROVIDER_PREFIX = 'fal-kontext:';

export interface FalKontextInput {
  prompt: string;
  sourceImageUrl: string;
  aspectRatio?: string;
  seed?: number;
}

export interface FalKontextResult {
  jobId: string;
  status: GenerationJobState;
  outputUrl?: string;
  error?: GenerationJobError;
}

export async function submitFalKontext(input: FalKontextInput): Promise<string> {
  const provider = createFalMediaProvider();
  const ref = await provider.imageCond!.submitImage(
    {
      prompt: input.prompt,
      imageUrls: [input.sourceImageUrl],
      aspectRatio: (input.aspectRatio ?? '9:16') as '9:16' | '16:9' | '1:1' | '4:3' | '3:4',
      ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
    },
    { idempotencyKey: `kontext:${randomUUID()}` },
  );
  return `${PROVIDER_PREFIX}${ref.requestId}`;
}

export async function getFalKontextStatus(jobId: string): Promise<FalKontextResult> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'image', requestId, idempotencyKey: '', model: ENDPOINT };

  const res = await provider.imageCond!.getStatus(ref);
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

export async function cancelFalKontext(jobId: string): Promise<boolean> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'image', requestId, idempotencyKey: '', model: ENDPOINT };
  try {
    await provider.imageCond!.cancel(ref);
    return true;
  } catch {
    return false;
  }
}
