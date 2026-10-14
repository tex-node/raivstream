/**
 * FLUX.2 edit — via fal.ai (`fal-ai/flux-2/edit`).
 *
 * Track D Layer 1 — multi-reference image editing. Conditions the scene still on
 * each locked character's approved reference so regenerations stay consistent
 * (FLUX.2 text-to-image is stochastic and drifted between regenerations).
 *
 * Gated by FAL_IMAGE_EDIT_ENABLED (default off). The provider throws
 * PROVIDER_DISABLED when the gate is closed, so this adapter is inert until the
 * env var is enabled. Output is mirrored to R2.
 */

import { randomUUID } from 'node:crypto';
import { createFalMediaProvider, persistFalOutput, type MediaJobRef } from '../mediaProviders';
import { resultInvalid, storageFailed, type GenerationJobError, type GenerationJobState } from './jobModel';

const ENDPOINT = 'fal-ai/flux-2/edit';
const PROVIDER_PREFIX = 'fal-flux2edit:';

export interface FalFlux2EditInput {
  prompt: string;
  imageUrls: string[];
  aspectRatio?: string;
  seed?: number;
}

export interface FalFlux2EditResult {
  jobId: string;
  status: GenerationJobState;
  outputUrl?: string;
  error?: GenerationJobError;
}

export async function submitFalFlux2Edit(input: FalFlux2EditInput): Promise<string> {
  const provider = createFalMediaProvider();
  const ref = await provider.imageEdit!.submitImage(
    {
      prompt: input.prompt,
      imageUrls: input.imageUrls,
      aspectRatio: (input.aspectRatio ?? '9:16') as '9:16' | '16:9' | '1:1' | '4:3' | '3:4',
      ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
    },
    { idempotencyKey: `flux2edit:${randomUUID()}` },
  );
  return `${PROVIDER_PREFIX}${ref.requestId}`;
}

export async function getFalFlux2EditStatus(jobId: string): Promise<FalFlux2EditResult> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'image', requestId, idempotencyKey: '', model: ENDPOINT };

  const res = await provider.imageEdit!.getStatus(ref);
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

export async function cancelFalFlux2Edit(jobId: string): Promise<boolean> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'image', requestId, idempotencyKey: '', model: ENDPOINT };
  try {
    await provider.imageEdit!.cancel(ref);
    return true;
  } catch {
    return false;
  }
}
