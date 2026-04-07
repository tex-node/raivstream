/**
 * Grok Imagine (xAI) — AI image generation, used as a seed/thumbnail for video content.
 *
 * API credentials: set XAI_API_KEY in .env
 * Docs:            https://docs.x.ai/docs/api-reference#create-image
 *
 * Grok Imagine generates high-quality images from text prompts.
 * The generated image can be used as:
 *   1. A thumbnail for a video
 *   2. A seed frame fed into a video generation model (e.g. Wan 2.5, Kling)
 *
 * xAI uses an OpenAI-compatible REST API.
 */

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

/** Map our aspect ratio string to the nearest xAI-supported size */
function aspectRatioToSize(ar?: string): string {
  switch (ar) {
    case '9:16': return '1024x1820';
    case '16:9': return '1820x1024';
    case '4:3':  return '1365x1024';
    case '3:4':  return '1024x1365';
    default:     return '1024x1024'; // square fallback
  }
}

/**
 * Generate an image using Grok Imagine.
 * Returns the URL(s) of the generated image(s).
 */
export async function generateImage(input: GrokImagineInput): Promise<GrokImagineResult[]> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY is not set in environment variables');

  const res = await fetch(`${XAI_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-2-image',
      prompt: input.negativePrompt
        ? `${input.prompt} (avoid: ${input.negativePrompt})`
        : input.prompt,
      n: input.n ?? 1,
      size: aspectRatioToSize(input.aspectRatio),
      response_format: 'url',
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
 *   1. Generate an image from the prompt
 *   2. Return the image URL so it can be passed to a video model or stored as a thumbnail
 *
 * When a dedicated Grok video endpoint becomes available, replace step 2 with a
 * video generation call using the image as a seed frame.
 */
export async function generateVideoFromPrompt(input: GrokImagineInput): Promise<{
  jobId: string;
  thumbnailUrl: string;
}> {
  const [result] = await generateImage(input);
  // Grok Imagine is currently image-only.
  // The returned image is used as a thumbnail / seed for downstream video models.
  // jobId is the image URL itself (no async polling needed for image generation).
  return {
    jobId: `grok-image-${Date.now()}`,
    thumbnailUrl: result.imageUrl,
  };
}
