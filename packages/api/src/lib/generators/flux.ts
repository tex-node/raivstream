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
  normaliseRunpodError,
  extractOutputUrl,
  type NormalisedStatus,
} from './runpod';
import { mirrorUrlToR2 } from '../r2';
import { resultInvalid, storageFailed, type GenerationJobError } from './jobModel';

export interface FluxInput {
  prompt:       string;
  negativePrompt?: string;
  aspectRatio?: string;
  seed?:        number;
}

export interface FluxJobResult {
  jobId:      string;
  status:     NormalisedStatus;
  outputUrl?: string;
  error?:     GenerationJobError;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ENDPOINT = () => process.env.RUNPOD_FLUX_PUBLIC_ENDPOINT ?? 'black-forest-labs-flux-1-dev';
const PORTRAIT_ENDPOINT = () => process.env.RUNPOD_FLUX_PORTRAIT_ENDPOINT ?? 'z-image-turbo';
const STEPS    = () => parseInt(process.env.RUNPOD_FLUX_STEPS    ?? '28', 10);
const GUIDANCE = () => parseFloat(process.env.RUNPOD_FLUX_GUIDANCE ?? '3.5');
const PORTRAIT_PREFIX = 'portrait:';

function getResolution(aspectRatio?: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16': return { width: 720,  height: 1280 };
    case '16:9': return { width: 1344, height: 768 };
    case '4:3':  return { width: 1024, height: 768 };
    case '3:4':  return { width: 768,  height: 1024 };
    case '1:1':  return { width: 1024, height: 1024 };
    default:     return { width: 720,  height: 1280 };  // 9:16 portrait default
  }
}

function shouldUsePortraitEndpoint(aspectRatio?: string) {
  return !aspectRatio || aspectRatio === '9:16';
}

function splitProviderJobId(jobId: string) {
  if (jobId.startsWith(PORTRAIT_PREFIX)) {
    return { endpoint: PORTRAIT_ENDPOINT(), jobId: jobId.slice(PORTRAIT_PREFIX.length), isPortrait: true };
  }
  return { endpoint: ENDPOINT(), jobId, isPortrait: false };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function submitFlux(input: FluxInput): Promise<string> {
  const { width, height } = getResolution(input.aspectRatio);
  if (shouldUsePortraitEndpoint(input.aspectRatio)) {
    const { jobId } = await submitJob(PORTRAIT_ENDPOINT(), {
      prompt: input.prompt,
      size: `${width}*${height}`,
      seed: input.seed ?? -1,
      output_format: 'png',
      enable_safety_checker: true,
    }, { executionTimeout: 300_000, ttl: 3_600_000 });
    return `${PORTRAIT_PREFIX}${jobId}`;
  }

  const payload = {
    prompt:              input.prompt,
    negative_prompt:     input.negativePrompt,
    size:                `${width}*${height}`,
    width,
    height,
    num_inference_steps: STEPS(),
    guidance:            GUIDANCE(),
    seed:                input.seed ?? -1,
    output_format:       'png',
  };
  const { jobId } = await submitJob(ENDPOINT(), payload, { executionTimeout: 300_000, ttl: 3_600_000 });
  return jobId;
}

export async function getFluxStatus(jobId: string): Promise<FluxJobResult> {
  const providerJob = splitProviderJobId(jobId);
  const raw    = await getJobStatus(providerJob.endpoint, providerJob.jobId);
  const status = normaliseStatus(raw.status);

  if (status !== 'completed') {
    return { jobId, status, error: normaliseRunpodError(raw.status, raw.error) };
  }

  const rawUrl = extractOutputUrl(raw.output);
  if (!rawUrl) {
    console.error('[flux] COMPLETED job has no extractable output URL. Raw output:', JSON.stringify(raw.output));
    return { jobId, status: 'failed', error: resultInvalid() };
  }

  const safeJobId = jobId.replace(/[^a-zA-Z0-9._-]/g, '-');
  const r2Key = `generated/flux/${safeJobId}.${providerJob.isPortrait ? 'png' : 'jpg'}`;
  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, r2Key, providerJob.isPortrait ? 'image/png' : 'image/jpeg');
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[flux] R2 mirror failed:', (err as Error).message);
    return { jobId, status: 'failed', error: storageFailed() };
  }
}
