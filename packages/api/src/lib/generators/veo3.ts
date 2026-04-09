/**
 * Veo 3 — Google's video generation model via Gemini API.
 *
 * API credentials: GEMINI_API_KEY (same key as Nano Banana / Gemini image)
 * Model:           veo-3.1-generate-preview (configurable via VEO_MODEL env)
 * Docs:            https://ai.google.dev/api/generate-videos
 *
 * Flow:
 *   1. POST generateVideos → returns a long-running operation name
 *   2. Poll GET operation until done === true
 *   3. Extract video URI from response → download → mirror to R2
 *
 * Generation takes ~2–5 minutes. The UI polls every 10 seconds.
 *
 * Supported aspect ratios: "16:9" | "16:10"  (portrait 9:16 is NOT supported)
 */

import { mirrorUrlToR2 } from '../r2';

const BASE_URL  = 'https://generativelanguage.googleapis.com/v1beta';
const VEO_MODEL = process.env.VEO_MODEL ?? 'veo-3.1-generate-preview';

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in environment variables');
  return key;
}

/** Veo 3 only supports landscape ratios — map any input to a supported value */
function normaliseAspectRatio(ratio?: string): '16:9' | '16:10' {
  if (ratio === '16:10') return '16:10';
  return '16:9'; // default (also covers 9:16, 1:1, etc.)
}

export interface Veo3Input {
  prompt:          string;
  negativePrompt?: string;
  aspectRatio?:    string;
  duration?:       number; // seconds (5–8)
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

  const duration = Math.min(8, Math.max(5, input.duration ?? 8));

  const res = await fetch(
    `${BASE_URL}/models/${VEO_MODEL}:generateVideos?key=${key}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: {
          prompt: input.prompt,
        },
        config: {
          aspectRatio:      normaliseAspectRatio(input.aspectRatio),
          numberOfVideos:   1,
          durationSeconds:  duration,
          resolution:       '720p',
          personGeneration: 'allow_adult',
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

  return data.name;
}

/**
 * Poll the operation status.
 * When done, downloads the video and mirrors it to R2.
 */
export async function getVeo3Status(operationName: string): Promise<Veo3Status> {
  const key = apiKey();

  const res = await fetch(`${BASE_URL}/${operationName}?key=${key}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Veo 3 status error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    done?:     boolean;
    error?:    { message: string };
    response?: {
      generatedVideos?: Array<{ video?: { uri?: string; mimeType?: string } }>;
      generateVideoResponse?: {
        generatedSamples?: Array<{ video?: { uri?: string; mimeType?: string } }>;
      };
    };
  };

  if (!data.done) {
    return { status: 'generating' };
  }

  if (data.error) {
    return { status: 'failed', error: data.error.message };
  }

  // Extract video URI — handle both known response shapes
  const video =
    data.response?.generatedVideos?.[0]?.video ??
    data.response?.generateVideoResponse?.generatedSamples?.[0]?.video;

  const videoUri = video?.uri;
  const mimeType = video?.mimeType ?? 'video/mp4';

  if (!videoUri) {
    console.error('[veo3] Unexpected response shape:', JSON.stringify(data));
    return { status: 'failed', error: 'No video URI in Veo 3 response' };
  }

  // Download from Google Files API and mirror to R2
  const downloadUrl = videoUri.includes('?')
    ? `${videoUri}&key=${key}&alt=media`
    : `${videoUri}?key=${key}&alt=media`;

  const jobId = operationName.split('/').pop() ?? Date.now().toString();
  const r2Key = `generated/veo3/${jobId}.mp4`;

  try {
    const permanentUrl = await mirrorUrlToR2(downloadUrl, r2Key, mimeType);
    return { status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[veo3] R2 mirror failed:', (err as Error).message);
    return { status: 'completed', outputUrl: downloadUrl };
  }
}
