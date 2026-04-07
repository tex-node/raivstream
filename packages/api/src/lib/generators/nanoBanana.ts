/**
 * Nano Banana — text-to-video generation
 *
 * API credentials: set NANO_BANANA_API_KEY in .env
 * Docs:            TODO — add endpoint docs when credentials are received
 *
 * The integration below follows Replicate's prediction API pattern, which is the
 * most common pattern for GPU-backed video generation providers.  Swap the
 * endpoint / payload shape to match the actual Nano Banana API when available.
 */

export interface NanoBananaInput {
  prompt: string;
  negativePrompt?: string;
  /** Duration in seconds (1–10) */
  duration?: number;
  /** e.g. "9:16" | "16:9" | "1:1" */
  aspectRatio?: string;
  /** Optional seed image URL for image-to-video */
  seedImageUrl?: string;
}

export interface NanoBananaJob {
  jobId: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  outputUrl?: string;
  error?: string;
}

const BASE_URL = process.env.NANO_BANANA_BASE_URL ?? 'https://api.nanobanana.ai/v1';

function headers() {
  const key = process.env.NANO_BANANA_API_KEY;
  if (!key) throw new Error('NANO_BANANA_API_KEY is not set in environment variables');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/**
 * Submit a new video generation job.
 * Returns a provider job ID that can be polled with `getJobStatus`.
 */
export async function submitGeneration(input: NanoBananaInput): Promise<string> {
  // TODO: uncomment and adjust when the Nano Banana API endpoint is confirmed
  // const res = await fetch(`${BASE_URL}/predictions`, {
  //   method: 'POST',
  //   headers: headers(),
  //   body: JSON.stringify({
  //     prompt: input.prompt,
  //     negative_prompt: input.negativePrompt ?? '',
  //     duration: input.duration ?? 5,
  //     aspect_ratio: input.aspectRatio ?? '9:16',
  //     ...(input.seedImageUrl ? { seed_image: input.seedImageUrl } : {}),
  //   }),
  // });
  // if (!res.ok) throw new Error(`Nano Banana API error: ${res.status} ${await res.text()}`);
  // const data = await res.json();
  // return data.id as string;

  throw new Error(
    'Nano Banana is not yet live — add NANO_BANANA_API_KEY to your .env and uncomment the API call in packages/api/src/lib/generators/nanoBanana.ts'
  );
}

/**
 * Poll the status of a previously submitted job.
 */
export async function getJobStatus(jobId: string): Promise<NanoBananaJob> {
  // TODO: uncomment when API is available
  // const res = await fetch(`${BASE_URL}/predictions/${jobId}`, { headers: headers() });
  // if (!res.ok) throw new Error(`Nano Banana status error: ${res.status}`);
  // const data = await res.json();
  // const statusMap: Record<string, NanoBananaJob['status']> = {
  //   starting: 'queued', processing: 'generating',
  //   succeeded: 'completed', failed: 'failed', canceled: 'failed',
  // };
  // return {
  //   jobId: data.id,
  //   status: statusMap[data.status] ?? 'queued',
  //   outputUrl: data.output?.[0] ?? undefined,
  //   error: data.error ?? undefined,
  // };

  throw new Error('Nano Banana API not yet configured');
}
