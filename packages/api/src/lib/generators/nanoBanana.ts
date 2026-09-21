/**
 * Nano Banana — AI image generation powered by Google Gemini.
 *
 * API credentials: set GEMINI_API_KEY in .env
 * Model:           gemini-3.1-flash-image-preview (configurable via GEMINI_IMAGE_MODEL)
 * Docs:            https://ai.google.dev/api/generate-content
 *
 * Gemini returns inline base64 image data — we upload directly to R2
 * for permanent storage.
 *
 * Generation is synchronous (no polling needed) — job completes immediately.
 */

import { uploadBufferToR2 } from '../r2';
import type { GenerationJobError } from './jobModel';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL    = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image-preview';

export interface NanoBananaInput {
  prompt:          string;
  negativePrompt?: string;
  duration?:       number;
  aspectRatio?:    string;
  seedImageUrl?:   string;
}

export interface NanoBananaJob {
  jobId:      string;
  status:     'queued' | 'generating' | 'completed' | 'failed';
  outputUrl?: string;
  error?:     GenerationJobError;
}

/**
 * Submit a generation job — calls Gemini, uploads result to R2, returns job ID.
 * Since Gemini is synchronous we generate and store immediately.
 */
export async function submitGeneration(input: NanoBananaInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables');

  // Build prompt — weave in negative prompt naturally
  const prompt = input.negativePrompt
    ? `${input.prompt}. Avoid: ${input.negativePrompt}`
    : input.prompt;

  const res = await fetch(
    `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    candidates: Array<{
      content: {
        parts: Array<{
          inlineData?: { mimeType: string; data: string };
          text?:       string;
        }>;
      };
    }>;
  };

  // Find the first image part
  const imagePart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!imagePart?.inlineData) {
    throw new Error('Gemini returned no image data');
  }

  const { mimeType, data: b64 } = imagePart.inlineData;
  const buffer    = Buffer.from(b64, 'base64');
  const ext       = mimeType.includes('png') ? 'png' : 'jpg';
  const jobId     = `nano-banana-${Date.now()}`;
  const key       = `generated/nano-banana/${jobId}.${ext}`;

  const permanentUrl = await uploadBufferToR2(buffer, key, mimeType);

  if (!permanentUrl) {
    // R2 not configured — store b64 as data URI as last resort (dev only)
    console.warn('[nano-banana] R2 not available — using data URI (not suitable for production)');
    // Store job result in a temp map so pollStatus can retrieve it
    _pendingJobs.set(jobId, { status: 'completed', outputUrl: `data:${mimeType};base64,${b64}` });
    return jobId;
  }

  // Store completed result so pollStatus can return it
  _pendingJobs.set(jobId, { status: 'completed', outputUrl: permanentUrl });
  return jobId;
}

// In-memory store for completed synchronous jobs (survives within one process lifetime)
// The generation router calls pollStatus once after submit to get the outputUrl.
const _pendingJobs = new Map<string, { status: string; outputUrl?: string; error?: GenerationJobError }>();

/**
 * Poll job status — for Gemini (synchronous) this always returns completed
 * with the URL stored during submitGeneration.
 */
export async function getJobStatus(jobId: string): Promise<NanoBananaJob> {
  const job = _pendingJobs.get(jobId);
  if (job) {
    _pendingJobs.delete(jobId); // clean up after first read
    return {
      jobId,
      status:    job.status as NanoBananaJob['status'],
      outputUrl: job.outputUrl,
      error:     job.error,
    };
  }
  // Job already retrieved or from a previous process — treat as completed
  return { jobId, status: 'completed' };
}
