/**
 * Seedance 1.0 Pro (ByteDance) — via RunPod Public Endpoint
 *
 * Supports both text-to-video (T2V) and image-to-video (I2V).
 * Uses the RunPod-hosted public endpoint — no custom serverless setup required.
 *
 * Public endpoint docs:
 *   https://docs.runpod.io/public-endpoints/models/seedance-1-pro
 *
 * Required env vars:
 *   RUNPOD_API_KEY
 *
 * Optional:
 *   RUNPOD_SEEDANCE_PUBLIC_ENDPOINT   endpoint slug  (default: seedance-1-0-pro)
 *   RUNPOD_SEEDANCE_FPS               output FPS     (default: 24)
 */

import {
  submitJob,
  getJobStatus,
  normaliseStatus,
  extractOutputUrl,
  type NormalisedStatus,
} from './runpod';
import { mirrorUrlToR2 } from '../r2';

export interface SeedanceInput {
  prompt:          string;
  negativePrompt?: string;
  duration?:       number;
  aspectRatio?:    string;
  seedImageUrl?:   string;
  seed?:           number;
}

export interface SeedanceJobResult {
  jobId:      string;
  status:     NormalisedStatus;
  outputUrl?: string;
  error?:     string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ENDPOINT = () => process.env.RUNPOD_SEEDANCE_PUBLIC_ENDPOINT ?? 'seedance-1-0-pro';
const FPS      = () => parseInt(process.env.RUNPOD_SEEDANCE_FPS ?? '24', 10);

// Seedance size parameter format: "WIDTHxHEIGHT"
function getSize(aspectRatio?: string): string {
  switch (aspectRatio) {
    case '16:9': return '1920x1080';
    case '1:1':  return '1080x1080';
    default:     return '1080x1920';  // 9:16 portrait default
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function submitSeedance(input: SeedanceInput): Promise<string> {
  const payload: Record<string, unknown> = {
    prompt:   input.prompt,
    duration: input.duration ?? 5,
    fps:      FPS(),
    size:     getSize(input.aspectRatio),
  };
  if (input.seedImageUrl) payload.image = input.seedImageUrl;
  if (input.seed != null)  payload.seed  = input.seed;

  const { jobId } = await submitJob(ENDPOINT(), payload, { executionTimeout: 900_000, ttl: 3_600_000 });
  return jobId;
}

export async function getSeedanceStatus(jobId: string): Promise<SeedanceJobResult> {
  const raw    = await getJobStatus(ENDPOINT(), jobId);
  const status = normaliseStatus(raw.status);

  if (status !== 'completed') {
    return { jobId, status, error: raw.error };
  }

  const rawUrl = extractOutputUrl(raw.output);
  if (!rawUrl) {
    console.error('[seedance] COMPLETED job has no extractable output URL. Raw output:', JSON.stringify(raw.output));
    return { jobId, status: 'failed', error: 'Generation completed but produced no output URL' };
  }

  const r2Key = `generated/seedance/${jobId}.mp4`;
  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, r2Key, 'video/mp4');
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[seedance] R2 mirror failed:', (err as Error).message);
    return { jobId, status: 'failed', error: 'Failed to save video to storage — please retry' };
  }
}
