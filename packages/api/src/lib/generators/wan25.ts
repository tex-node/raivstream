/**
 * Wan 2.6 (Alibaba) — via RunPod Public Endpoints
 *
 * Automatically routes between two public endpoints:
 *   wan-2-6-t2v  — text-to-video (no image required)
 *   wan-2-6-i2v  — image-to-video (seed image required, landscape only)
 *
 * The endpoint used is encoded in the returned providerJobId as a prefix:
 *   "t2v:<runpodJobId>"  or  "i2v:<runpodJobId>"
 * so the status poller always hits the correct endpoint.
 *
 * Public endpoint docs:
 *   https://docs.runpod.io/public-endpoints/models/wan-2-6-t2v
 *   https://docs.runpod.io/public-endpoints/models/wan-2-6-i2v
 *
 * Required env vars:
 *   RUNPOD_API_KEY
 *
 * Optional overrides:
 *   RUNPOD_WAN26_T2V_ENDPOINT   (default: wan-2-6-t2v)
 *   RUNPOD_WAN26_I2V_ENDPOINT   (default: wan-2-6-i2v)
 */

import {
  submitJob,
  getJobStatus,
  normaliseStatus,
  extractOutputUrl,
  type NormalisedStatus,
} from './runpod';
import { mirrorUrlToR2 } from '../r2';

export interface Wan25Input {
  prompt:          string;
  negativePrompt?: string;
  duration?:       number;
  aspectRatio?:    string;
  seedImageUrl?:   string;
  seed?:           number;
}

export interface Wan25JobResult {
  jobId:      string;
  status:     NormalisedStatus;
  outputUrl?: string;
  error?:     string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const T2V_ENDPOINT = () => process.env.RUNPOD_WAN26_T2V_ENDPOINT ?? 'wan-2-6-t2v';
const I2V_ENDPOINT = () => process.env.RUNPOD_WAN26_I2V_ENDPOINT ?? 'wan-2-6-i2v';

// Duration must be 5, 10, or 15 — snap to nearest valid value
function snapDuration(sec?: number): number {
  const s = sec ?? 5;
  if (s <= 7)  return 5;
  if (s <= 12) return 10;
  return 15;
}

// T2V supports portrait; I2V is landscape only
function getSize(aspectRatio?: string, isI2V = false): string {
  if (isI2V) return '1280*720'; // I2V: landscape only
  switch (aspectRatio) {
    case '16:9': return '1280*720';
    case '1:1':  return '720*720';
    default:     return '720*1280'; // 9:16 portrait default
  }
}

// Parse the "t2v:<id>" / "i2v:<id>" prefix stored in providerJobId
function parseJobId(prefixedId: string): { endpoint: string; runpodJobId: string } {
  if (prefixedId.startsWith('i2v:')) {
    return { endpoint: I2V_ENDPOINT(), runpodJobId: prefixedId.slice(4) };
  }
  // t2v: prefix or legacy bare ID
  const runpodJobId = prefixedId.startsWith('t2v:') ? prefixedId.slice(4) : prefixedId;
  return { endpoint: T2V_ENDPOINT(), runpodJobId };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function submitWan25(input: Wan25Input): Promise<string> {
  const isI2V    = !!input.seedImageUrl;
  const endpoint = isI2V ? I2V_ENDPOINT() : T2V_ENDPOINT();
  const prefix   = isI2V ? 'i2v' : 't2v';

  const payload: Record<string, unknown> = {
    prompt:   input.prompt,
    duration: snapDuration(input.duration),
    size:     getSize(input.aspectRatio, isI2V),
    seed:     input.seed ?? -1,
  };
  if (input.negativePrompt) payload.negative_prompt = input.negativePrompt;
  if (isI2V)                payload.image            = input.seedImageUrl;

  const { jobId } = await submitJob(endpoint, payload, { executionTimeout: 900_000, ttl: 3_600_000 });
  return `${prefix}:${jobId}`;
}

export async function getWan25Status(prefixedJobId: string): Promise<Wan25JobResult> {
  const { endpoint, runpodJobId } = parseJobId(prefixedJobId);
  const raw    = await getJobStatus(endpoint, runpodJobId);
  const status = normaliseStatus(raw.status);

  if (status !== 'completed') {
    return { jobId: prefixedJobId, status, error: raw.error };
  }

  const rawUrl = extractOutputUrl(raw.output);
  if (!rawUrl) {
    console.error('[wan26] COMPLETED job has no extractable output URL. Raw output:', JSON.stringify(raw.output));
    return { jobId: prefixedJobId, status: 'failed', error: 'Generation completed but produced no output URL' };
  }

  const r2Key = `generated/wan26/${runpodJobId}.mp4`;
  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, r2Key, 'video/mp4');
    return { jobId: prefixedJobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[wan26] R2 mirror failed:', (err as Error).message);
    return { jobId: prefixedJobId, status: 'failed', error: 'Failed to save video to storage — please retry' };
  }
}
