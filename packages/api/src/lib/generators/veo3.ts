/**
 * Veo 3 — Google's video generation model via Gemini API.
 *
 * API credentials: GEMINI_API_KEY (same key as Nano Banana / Gemini image)
 * Model:           veo-3.1-generate-preview (configurable via VEO_MODEL env)
 * Docs:            https://ai.google.dev/api/generate-videos
 *
 * Flow:
 *   1. POST generateVideo → returns a long-running operation name
 *   2. Poll GET operation until done === true
 *   3. Extract video URI from response → download → mirror to R2
 *
 * Generation takes ~2–5 minutes. The UI polls every 10 seconds.
 */

import { mirrorUrlToR2 } from '../r2';

const BASE_URL  = 'https://generativelanguage.googleapis.com/v1beta';
const VEO_MODEL = process.env.VEO_MODEL ?? 'veo-3.1-generate-preview';

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in environment variables');
  return key;
}

export interface Veo3Input {
  prompt:          string;
  negativePrompt?: string;
  aspectRatio?:    string;
  duration?:       number; // seconds
}

export interface Veo3Status {
  status:     'queued' | 'generating' | 'completed' | 'failed';
  outputUrl?: string;
  error?:     string;
}

/**
 * Submit a video generation job to Veo 3.
 * Returns the operation name (used as providerJobId for polling).
 */
export async function submitVeo3(input: Veo3Input): Promise<string> {
  const key = apiKey();

  const res = await fetch(
    `${BASE_URL}/models/${VEO_MODEL}:generateVideo?key=${key}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        config: {
          aspectRatio:    input.aspectRatio ?? '9:16',
          numberOfVideos: 1,
          ...(input.duration ? { durationSeconds: input.duration } : {}),
          ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Veo 3 API error ${res.status}: ${body}`);
  }

  const data = await res.json() as { name: string };

  if (!data.name) {
    throw new Error(`Veo 3 did not return an operation name: ${JSON.stringify(data)}`);
  }

  // operation name looks like "operations/abc123def456"
  return data.name;
}

/**
 * Poll the operation status.
 * When done, downloads the video and mirrors it to R2.
 */
export async function getVeo3Status(operationName: string): Promise<Veo3Status> {
  const key = apiKey();

  // operationName may or may not include the "v1beta/" prefix — normalise
  const path = operationName.startsWith('operations/')
    ? operationName
    : operationName.replace(/^.*\/(operations\/.*)$/, '$1');

  const res = await fetch(`${BASE_URL}/${path}?key=${key}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Veo 3 status error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    done?:     boolean;
    error?:    { message: string };
    response?: {
      generateVideoResponse?: {
        generatedSamples?: Array<{ video?: { uri?: string; mimeType?: string } }>;
      };
      generatedVideos?: Array<{ video?: { uri?: string; mimeType?: string } }>;
    };
  };

  if (!data.done) {
    return { status: 'generating' };
  }

  if (data.error) {
    return { status: 'failed', error: data.error.message };
  }

  // Extract video URI — handle both known response shapes
  const sample =
    data.response?.generateVideoResponse?.generatedSamples?.[0] ??
    data.response?.generatedVideos?.[0];

  const videoUri  = sample?.video?.uri;
  const mimeType  = sample?.video?.mimeType ?? 'video/mp4';

  if (!videoUri) {
    console.error('[veo3] Unexpected response shape:', JSON.stringify(data));
    return { status: 'failed', error: 'No video URI in Veo 3 response' };
  }

  // Download the video from Google's Files API and mirror to R2
  const downloadUrl = videoUri.includes('?')
    ? `${videoUri}&key=${key}&alt=media`
    : `${videoUri}?key=${key}&alt=media`;

  const jobId       = operationName.split('/').pop() ?? Date.now().toString();
  const key2        = `generated/veo3/${jobId}.mp4`;

  try {
    const permanentUrl = await mirrorUrlToR2(downloadUrl, key2, mimeType);
    return { status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[veo3] R2 mirror failed:', (err as Error).message);
    // Fall back to the raw Google URI (will expire but better than nothing)
    return { status: 'completed', outputUrl: downloadUrl };
  }
}
