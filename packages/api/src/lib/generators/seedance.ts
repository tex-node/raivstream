/**
 * Seedance 1.5 Pro I2V (ByteDance) — via RunPod Public Endpoint
 *
 * Image-to-video model. A seed image URL is required.
 * Supports audio synthesis and camera stabilisation.
 *
 * Public endpoint docs:
 *   https://docs.runpod.io/public-endpoints/models/seedance-1-5-pro
 *
 * Required env vars:
 *   RUNPOD_API_KEY
 *
 * Optional:
 *   RUNPOD_SEEDANCE_PUBLIC_ENDPOINT   endpoint slug       (default: seedance-v1-5-pro-i2v)
 *   RUNPOD_SEEDANCE_RESOLUTION        480p | 720p         (default: 720p)
 *   RUNPOD_SEEDANCE_GENERATE_AUDIO    true | false        (default: false)
 *   RUNPOD_SEEDANCE_CAMERA_FIXED      true | false        (default: false)
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

const ENDPOINT       = () => process.env.RUNPOD_SEEDANCE_PUBLIC_ENDPOINT ?? 'seedance-v1-5-pro-i2v';
const RESOLUTION     = () => process.env.RUNPOD_SEEDANCE_RESOLUTION      ?? '720p';
const GENERATE_AUDIO = () => process.env.RUNPOD_SEEDANCE_GENERATE_AUDIO  === 'true';
const CAMERA_FIXED   = () => process.env.RUNPOD_SEEDANCE_CAMERA_FIXED    === 'true';

// Seedance 1.5 uses standard ratio strings e.g. "9:16"
function getAspectRatio(ar?: string): string {
  switch (ar) {
    case '16:9': return '16:9';
    case '1:1':  return '1:1';
    case '4:3':  return '4:3';
    case '3:4':  return '3:4';
    default:     return '9:16';  // portrait default
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function submitSeedance(input: SeedanceInput): Promise<string> {
  if (!input.seedImageUrl) {
    throw new Error(
      'Seedance 1.5 Pro is an image-to-video model and requires a seed image URL. ' +
      'Please provide a seed image or switch to a text-to-video model.'
    );
  }

  const duration = Math.min(12, Math.max(4, input.duration ?? 5));

  const payload: Record<string, unknown> = {
    prompt:          input.prompt,
    image:           input.seedImageUrl,
    duration,
    aspect_ratio:    getAspectRatio(input.aspectRatio),
    resolution:      RESOLUTION(),
    generate_audio:  GENERATE_AUDIO(),
    camera_fixed:    CAMERA_FIXED(),
  };
  if (input.seed != null) payload.seed = input.seed;

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
