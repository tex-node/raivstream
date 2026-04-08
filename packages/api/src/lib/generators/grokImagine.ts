/**
 * Grok Imagine (xAI) — AI image generation, used as a seed/thumbnail for video content.
 *
 * API credentials: set XAI_API_KEY in .env
 * Docs:            https://docs.x.ai/docs/api-reference#create-image
 *
 * xAI returns short-lived signed URLs — we immediately mirror them to R2
 * so they remain accessible permanently.
 *
 * xAI uses an OpenAI-compatible REST API.
 */

import { mirrorUrlToR2 } from '../r2';

export interface GrokImagineInput {
  prompt: string;
  negativePrompt?: string;
  /** e.g. "9:16" | "16:9" | "1:1" — maps to supported sizes */
  aspectRatio?: string;
  /** Number of images to generate (1–4) */
  n?: number;
}

export interface GrokImagineResult {
  imageUrl: string;
  revisedPrompt?: string;
}

const XAI_BASE_URL = 'https://api.x.ai/v1';

/**
 * Generate an image using Grok Imagine.
 * Returns the URL(s) of the generated image(s).
 *
 * grok-2-image only accepts: model, prompt, n
 * It does NOT support: size, response_format, or aspect_ratio parameters.
 */
export async function generateImage(input: GrokImagineInput): Promise<GrokImagineResult[]> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY is not set in environment variables');

  // Build prompt — weave negative prompt in naturally since there's no separate field
  const prompt = input.negativePrompt
    ? `${input.prompt}. Avoid: ${input.negativePrompt}`
    : input.prompt;

  const res = await fetch(`${XAI_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:  'grok-2-image',
      prompt,
      n: input.n ?? 1,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Grok Imagine API error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    data: Array<{ url: string; revised_prompt?: string }>;
  };

  return data.data.map((img) => ({
    imageUrl: img.url,
    revisedPrompt: img.revised_prompt,
  }));
}

/**
 * Full text-to-video flow using Grok Imagine:
 *   1. Generate an image from the prompt (xAI returns a short-lived signed URL)
 *   2. Mirror the image to R2 for permanent storage
 *   3. Return the permanent R2 URL
 *
 * When a dedicated Grok video endpoint becomes available, replace step 3 with a
 * video generation call using the image as a seed frame.
 */
export async function generateVideoFromPrompt(input: GrokImagineInput): Promise<{
  jobId: string;
  thumbnailUrl: string;
}> {
  const [result] = await generateImage(input);

  // xAI signed URLs expire in seconds — mirror to R2 immediately
  const jobId = `grok-image-${Date.now()}`;
  const key   = `generated/grok/${jobId}.jpg`;
  const permanentUrl = await mirrorUrlToR2(result.imageUrl, key, 'image/jpeg');

  return {
    jobId,
    thumbnailUrl: permanentUrl,
  };
}
