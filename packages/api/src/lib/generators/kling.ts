/**
 * Kling (Kuaishou) — via Kling AI REST API
 *
 * Two modes:
 *   KLING_I2V — Image-to-Video:  the seed image becomes the opening frame.
 *               Uses POST /v1/videos/image2video
 *
 *   KLING_R2V — Reference-to-Video: seed image guides style/subject but is NOT
 *               the first frame; text drives scene + motion.
 *               Uses POST /v1/videos/text2video with reference_image_list.
 *
 * Auth: short-lived HS256 JWT signed with KLING_ACCESS_KEY / KLING_SECRET_KEY.
 * Tokens expire after 30 minutes; a fresh one is minted per request.
 *
 * Polling: Kling jobs are async — submit returns task_id, poll until
 *   task_status === "succeed" | "failed".
 *
 * Required env vars:
 *   KLING_ACCESS_KEY   — from klingai.com developer console
 *   KLING_SECRET_KEY   — paired secret for JWT signing
 *
 * Optional:
 *   KLING_MODEL        — model name          (default: kling-v1-6)
 *   KLING_MODE         — std | pro           (default: std)
 *   KLING_CFG          — cfg_scale 0–1       (default: 0.5)
 */

import { createHmac } from 'crypto';
import { mirrorUrlToR2 } from '../r2';
import type { NormalisedStatus } from './runpod';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE  = 'https://api.klingai.com';
const MODEL = () => process.env.KLING_MODEL   ?? 'kling-v1-6';
const MODE  = () => (process.env.KLING_MODE   ?? 'std') as 'std' | 'pro';
const CFG   = () => parseFloat(process.env.KLING_CFG ?? '0.5');

function credentials(): { accessKey: string; secretKey: string } {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error(
      'Kling is not configured — add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env. ' +
      'Get your keys at https://klingai.com/developer'
    );
  }
  return { accessKey, secretKey };
}

// ─── JWT signing (HS256, no external deps) ────────────────────────────────────

function b64url(s: string): string {
  return Buffer.from(s)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function mintJwt(accessKey: string, secretKey: string): string {
  const now     = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }));
  const sig     = createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${header}.${payload}.${sig}`;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function klingPost<T>(path: string, body: unknown): Promise<T> {
  const { accessKey, secretKey } = credentials();
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${mintJwt(accessKey, secretKey)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kling API ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

async function klingGet<T>(path: string): Promise<T> {
  const { accessKey, secretKey } = credentials();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${mintJwt(accessKey, secretKey)}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kling API ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

// ─── Duration snapping ────────────────────────────────────────────────────────
// Kling accepts "5" or "10" seconds (string).

function snapDuration(sec?: number): '5' | '10' {
  return (sec ?? 5) <= 7 ? '5' : '10';
}

// ─── Aspect ratio ─────────────────────────────────────────────────────────────
// Kling: "16:9" | "9:16" | "1:1"

function normaliseAr(ar?: string): '9:16' | '16:9' | '1:1' {
  if (ar === '16:9') return '16:9';
  if (ar === '1:1')  return '1:1';
  return '9:16'; // portrait default
}

// ─── Status mapping ───────────────────────────────────────────────────────────

interface KlingStatusResp {
  code:    number;
  message: string;
  data: {
    task_id:      string;
    task_status:  'submitted' | 'processing' | 'succeed' | 'failed';
    task_result?: {
      videos?: Array<{ id: string; url: string; duration: string }>;
    };
  };
}

function mapStatus(s: KlingStatusResp['data']['task_status']): NormalisedStatus {
  switch (s) {
    case 'submitted':  return 'queued';
    case 'processing': return 'generating';
    case 'succeed':    return 'completed';
    case 'failed':     return 'failed';
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface KlingInput {
  prompt:         string;
  negativePrompt?: string;
  seedImageUrl?:  string;   // required for I2V; optional reference for R2V
  duration?:      number;
  aspectRatio?:   string;
  seed?:          number;
}

export interface KlingJobResult {
  jobId:      string;
  status:     NormalisedStatus;
  outputUrl?: string;
  error?:     string;
}

// ─── I2V — Image to Video ─────────────────────────────────────────────────────

/**
 * Submit an Image-to-Video job. The seed image becomes the opening frame.
 * Returns a prefixed job ID: "i2v:<task_id>"
 */
export async function submitKlingI2V(input: KlingInput): Promise<string> {
  if (!input.seedImageUrl) {
    throw new Error('Kling I2V requires a seed image URL (seedImageUrl).');
  }

  interface I2VResp { code: number; message: string; data: { task_id: string } }
  const resp = await klingPost<I2VResp>('/v1/videos/image2video', {
    model_name:      MODEL(),
    image:           input.seedImageUrl,
    prompt:          input.prompt,
    negative_prompt: input.negativePrompt ?? '',
    cfg_scale:       CFG(),
    mode:            MODE(),
    duration:        snapDuration(input.duration),
    aspect_ratio:    normaliseAr(input.aspectRatio),
  });

  if (resp.code !== 0) throw new Error(`Kling I2V error ${resp.code}: ${resp.message}`);
  return `i2v:${resp.data.task_id}`;
}

/**
 * Poll the status of a Kling I2V job.
 * jobId must be prefixed with "i2v:" as returned by submitKlingI2V.
 */
export async function getKlingI2VStatus(jobId: string): Promise<KlingJobResult> {
  const taskId = jobId.startsWith('i2v:') ? jobId.slice(4) : jobId;
  const resp   = await klingGet<KlingStatusResp>(`/v1/videos/image2video/${taskId}`);

  if (resp.code !== 0) {
    return { jobId, status: 'failed', error: `Kling API error ${resp.code}: ${resp.message}` };
  }

  const status = mapStatus(resp.data.task_status);
  if (status !== 'completed') return { jobId, status };

  const rawUrl = resp.data.task_result?.videos?.[0]?.url;
  if (!rawUrl) {
    return { jobId, status: 'failed', error: 'Kling I2V completed but returned no video URL' };
  }

  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, `generated/kling-i2v/${taskId}.mp4`, 'video/mp4');
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[kling-i2v] R2 mirror failed:', (err as Error).message);
    return { jobId, status: 'failed', error: 'Failed to save video to storage — please retry' };
  }
}

// ─── R2V — Reference to Video ─────────────────────────────────────────────────

/**
 * Submit a Reference-to-Video job.
 * The seed image guides style + subject; text drives scene and motion.
 * Returns a prefixed job ID: "r2v:<task_id>"
 *
 * When no seedImageUrl is provided the job falls back to pure text-to-video.
 */
export async function submitKlingR2V(input: KlingInput): Promise<string> {
  interface T2VResp { code: number; message: string; data: { task_id: string } }

  const body: Record<string, unknown> = {
    model_name:      MODEL(),
    prompt:          input.prompt,
    negative_prompt: input.negativePrompt ?? '',
    cfg_scale:       CFG(),
    mode:            MODE(),
    duration:        snapDuration(input.duration),
    aspect_ratio:    normaliseAr(input.aspectRatio),
  };

  // Attach reference image when provided
  if (input.seedImageUrl) {
    body.reference_image_list = [
      { reference_type: 'subject', reference_image: input.seedImageUrl },
    ];
  }

  const resp = await klingPost<T2VResp>('/v1/videos/text2video', body);
  if (resp.code !== 0) throw new Error(`Kling R2V error ${resp.code}: ${resp.message}`);
  return `r2v:${resp.data.task_id}`;
}

/**
 * Poll the status of a Kling R2V job.
 * jobId must be prefixed with "r2v:" as returned by submitKlingR2V.
 */
export async function getKlingR2VStatus(jobId: string): Promise<KlingJobResult> {
  const taskId = jobId.startsWith('r2v:') ? jobId.slice(4) : jobId;
  const resp   = await klingGet<KlingStatusResp>(`/v1/videos/text2video/${taskId}`);

  if (resp.code !== 0) {
    return { jobId, status: 'failed', error: `Kling API error ${resp.code}: ${resp.message}` };
  }

  const status = mapStatus(resp.data.task_status);
  if (status !== 'completed') return { jobId, status };

  const rawUrl = resp.data.task_result?.videos?.[0]?.url;
  if (!rawUrl) {
    return { jobId, status: 'failed', error: 'Kling R2V completed but returned no video URL' };
  }

  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, `generated/kling-r2v/${taskId}.mp4`, 'video/mp4');
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[kling-r2v] R2 mirror failed:', (err as Error).message);
    return { jobId, status: 'failed', error: 'Failed to save video to storage — please retry' };
  }
}
