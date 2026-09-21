/**
 * VEED Fabric 1.0 — via fal.ai (`veed/fabric-1.0`).
 *
 * Talking-person / lip-sync video from a presenter image + an audio track.
 * Gated by the default-off FAL_* config (FAL_UGC_ENABLED) and throws
 * PROVIDER_DISABLED when closed. UGC consent/ownership/moderation controls are
 * a separate prerequisite; this adapter only exposes the raw capability.
 *
 * Output is mirrored to R2.
 */

import { randomUUID } from 'node:crypto';
import { createFalMediaProvider, persistFalOutput, type MediaJobRef } from '../mediaProviders';
import { resultInvalid, storageFailed, type GenerationJobError, type GenerationJobState } from './jobModel';

const ENDPOINT = 'veed/fabric-1.0';
const PROVIDER_PREFIX = 'fal:';

export interface FalVeedInput {
  imageUrl:    string;
  audioUrl:    string;
  resolution?: string; // 480p | 720p
}

export interface FalVeedResult {
  jobId:      string;
  status:     GenerationJobState;
  outputUrl?: string;
  error?:     GenerationJobError;
}

export async function submitFalVeed(input: FalVeedInput): Promise<string> {
  if (!input.imageUrl) throw new Error('VEED Fabric requires a presenter image.');
  if (!input.audioUrl) throw new Error('VEED Fabric requires an audio track to lip-sync against.');

  const provider = createFalMediaProvider();
  const ref = await provider.ugc!.submitUGC(
    {
      imageUrl:    input.imageUrl,
      audioUrl:    input.audioUrl,
      ...(input.resolution ? { resolution: input.resolution } : {}),
    },
    { idempotencyKey: `veed:${randomUUID()}` },
  );
  return `${PROVIDER_PREFIX}${ref.requestId}`;
}

export async function getFalVeedStatus(jobId: string): Promise<FalVeedResult> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'ugc_video', requestId, idempotencyKey: '', model: ENDPOINT };

  const res = await provider.ugc!.getStatus(ref);
  if (res.status !== 'completed') {
    return { jobId, status: res.status, error: res.error };
  }

  const url = res.outputUrls[0];
  if (!url) {
    return { jobId, status: 'failed', error: resultInvalid() };
  }

  try {
    const permanentUrl = await persistFalOutput('ugc_video', requestId, url);
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch {
    return { jobId, status: 'failed', error: storageFailed() };
  }
}

export async function cancelFalVeed(jobId: string): Promise<boolean> {
  const requestId = jobId.replace(new RegExp(`^${PROVIDER_PREFIX}`), '');
  const provider = createFalMediaProvider();
  const ref: MediaJobRef = { provider: 'fal', kind: 'ugc_video', requestId, idempotencyKey: '', model: ENDPOINT };
  try {
    await provider.ugc!.cancel(ref);
    return true;
  } catch {
    return false;
  }
}
