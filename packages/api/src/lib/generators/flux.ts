/**
 * Flux.1 Dev (Black Forest Labs) — via RunPod Public Endpoint
 *
 * Uses the RunPod-hosted public endpoint — no custom serverless setup required.
 * Override the endpoint slug via RUNPOD_FLUX_PUBLIC_ENDPOINT if needed.
 *
 * Public endpoint docs:
 *   https://docs.runpod.io/public-endpoints/models/flux-1-dev
 *
 * Required env vars:
 *   RUNPOD_API_KEY
 *
 * Optional:
 *   RUNPOD_FLUX_PUBLIC_ENDPOINT   endpoint slug  (default: black-forest-labs-flux-1-dev)
 *   RUNPOD_FLUX_STEPS             inference steps (default: 28)
 *   RUNPOD_FLUX_GUIDANCE          guidance scale  (default: 3.5)
 */

import {
  submitJob,
  getJobStatus,
  normaliseStatus,
  extractOutputUrl,
  type NormalisedStatus,
} from './runpod';
import { mirrorUrlToR2 } from '../r2';

export interface FluxInput {
  prompt:       string;
  aspectRatio?: string;
  seed?:        number;
}

export interface FluxJobResult {
  jobId:      string;
  status:     NormalisedStatus;
  outputUrl?: string;
  error?:     string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ENDPOINT = () => process.env.RUNPOD_FLUX_PUBLIC_ENDPOINT ?? 'black-forest-labs-flux-1-dev';
const STEPS    = () => parseInt(process.env.RUNPOD_FLUX_STEPS    ?? '28', 10);
const GUIDANCE = () => parseFloat(process.env.RUNPOD_FLUX_GUIDANCE ?? '3.5');

function getResolution(aspectRatio?: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9': return { width: 1344, height: 768 };
    case '1:1':  return { width: 1024, height: 1024 };
    default:     return { width: 768,  height: 1344 };  // 9:16 portrait default
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function submitFlux(input: FluxInput): Promise<string> {
  const { width, height } = getResolution(input.aspectRatio);
  const payload = {
    prompt:              input.prompt,
    width,
    height,
    num_inference_steps: STEPS(),
    guidance:            GUIDANCE(),
    image_format:        'JPEG',
    seed:                input.seed ?? -1,
  };
  const { jobId } = await submitJob(ENDPOINT(), payload, { executionTimeout: 300_000, ttl: 3_600_000 });
  return jobId;
}

export async function getFluxStatus(jobId: string): Promise<FluxJobResult> {
  const raw    = await getJobStatus(ENDPOINT(), jobId);
  const status = normaliseStatus(raw.status);

  if (status !== 'completed') {
    return { jobId, status, error: raw.error };
  }

  const rawUrl = extractOutputUrl(raw.output);
  if (!rawUrl) {
    console.error('[flux] COMPLETED job has no extractable output URL. Raw output:', JSON.stringify(raw.output));
    return { jobId, status: 'failed', error: 'Generation completed but produced no output URL' };
  }

  const r2Key = `generated/flux/${jobId}.jpg`;
  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, r2Key, 'image/jpeg');
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[flux] R2 mirror failed:', (err as Error).message);
    return { jobId, status: 'failed', error: 'Failed to save image to storage — please retry' };
  }
}
