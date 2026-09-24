/**
 * fal.ai model contracts — normalized, provider-neutral mapping.
 *
 * These are the ONLY places fal's request/response shapes should appear.
 *
 * FLUX.2 contract reconciled 2026-09-12 against the live queue OpenAPI schema:
 *   https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-2
 * IMPORTANT: `fal-ai/flux-2` is TEXT-TO-IMAGE. Image editing/reference is a
 * separate endpoint (e.g. `fal-ai/flux-2/edit`) and is intentionally NOT
 * mapped here.
 *
 * H3-Max Turbo (`minimax/h3-max-turbo/image-to-video`) and VEED Fabric (`veed/fabric-1.0`)
 * reconciled 2026-09-12 against the live model pages:
 *   https://fal.ai/models/minimax/h3/image-to-video/api  (H3 family input/output)
 *   https://fal.ai/models/veed/fabric-1.0/api             (Fabric input/output)
 * Both are image-to-video; VEED Fabric additionally requires an audio track for
 * lip-sync. Output is `{ video: { url, content_type, file_name, file_size } }`.
 */

import {
  isAcceptableResultUrl,
  MediaProviderError,
  type ImageGenerationInput,
  type MediaArtifact,
  type MediaUsage,
  type UGCVideoInput,
  type VideoGenerationInput,
} from '../types';

export type ParsedMedia = MediaArtifact;

export interface ModelContractField {
  name: string;
  required: boolean;
  description: string;
}

export interface ModelContract {
  endpoint: string;
  kind: 'image' | 'video' | 'ugc_video';
  displayName: string;
  fields: ModelContractField[];
  notes?: string;
}

// ─── Reconciled: fal-ai/flux-2 (text-to-image) ────────────────────────────────

export const FLUX_2_CONTRACT: ModelContract = {
  endpoint: 'fal-ai/flux-2',
  kind: 'image',
  displayName: 'FLUX.2 [dev]',
  fields: [
    { name: 'prompt', required: true, description: 'Text prompt to generate an image from.' },
    { name: 'image_size', required: false, description: 'Enum (square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9) or {width,height} 512–2048.' },
    { name: 'num_images', required: false, description: 'Number of images (1–4, default 1).' },
    { name: 'seed', required: false, description: 'Integer seed; random when omitted.' },
    { name: 'output_format', required: false, description: 'jpeg | png | webp (default png).' },
    { name: 'guidance_scale', required: false, description: '0–20 (default 2.5).' },
    { name: 'num_inference_steps', required: false, description: '4–50 (default 28).' },
    { name: 'acceleration', required: false, description: 'none | regular | high (default regular).' },
    { name: 'enable_prompt_expansion', required: false, description: 'Boolean (default false).' },
    { name: 'sync_mode', required: false, description: 'Return data URI (default false).' },
    { name: 'enable_safety_checker', required: false, description: 'Boolean (default true).' },
  ],
  notes:
    'Text-to-image only (no image_url/image_urls on this endpoint). Output: { images:[{url,content_type,file_name,file_size,width,height}], timings, seed, has_nsfw_concepts, prompt }.',
};

// ─── Reconciled: minimax/h3-max-turbo/image-to-video (story image-to-video) ───

export const H3_MAX_I2V_CONTRACT: ModelContract = {
  endpoint: 'minimax/h3-max-turbo/image-to-video',
  kind: 'video',
  displayName: 'MiniMax H3-Max Turbo Image-to-Video',
  fields: [
    { name: 'prompt', required: true, description: 'Motion/scene prompt (required).' },
    { name: 'image_url', required: true, description: 'Opening frame image; output aspect ratio follows it.' },
    { name: 'end_image_url', required: false, description: 'Optional last frame for first-to-last keyframe generation.' },
    { name: 'duration', required: false, description: 'Integer seconds (default 5). Verified live up to 15s (2026-09-21).' },
    { name: 'resolution', required: false, description: 'Enum 480P | 768P | 1080P (uppercase; 1080P verified live at 1080x1920/24fps).' },
    { name: 'mode', required: false, description: 'fast | balanced | quality (default balanced).' },
    { name: 'seed', required: false, description: 'Deterministic seed.' },
    { name: 'prompt_expansion', required: false, description: 'Provider-side prompt expansion toggle.' },
  ],
  notes:
    'Image-to-video. Output: { video:{url,content_type,file_name,file_size}, expanded_prompt }. Billed per second. Native synchronized audio/SFX: the output carries an aac track and is driven by SFX cues in the prompt. Verified live: duration 15s + resolution 1080P -> 15.1s, h264 1080x1920 @ 24fps, aac (2026-09-21).',
};

export const VEED_FABRIC_CONTRACT: ModelContract = {
  endpoint: 'veed/fabric-1.0',
  kind: 'ugc_video',
  displayName: 'VEED Fabric 1.0',
  fields: [
    { name: 'image_url', required: true, description: 'Presenter image (photo or generated) with a clear front-facing face.' },
    { name: 'audio_url', required: true, description: 'Speech/audio track to lip-sync against (mp3/ogg/wav/m4a/aac).' },
    { name: 'resolution', required: true, description: 'Enum 720p | 480p (default 720p).' },
  ],
  notes:
    'Talking-person lip-sync. Output: { video:{url,content_type,...} }. Billed per second (480p $0.08/s, 720p $0.15/s). UGC gating/consent handled above the adapter.',
};

// ─── Reconciled: fal-ai/flux-pro/v1/kontext (image-conditioned generation) ────

export const FLUX_KONTEXT_CONTRACT: ModelContract = {
  endpoint: 'fal-ai/flux-pro/v1/kontext',
  kind: 'image',
  displayName: 'FLUX Pro Kontext',
  fields: [
    { name: 'prompt', required: true, description: 'Text prompt describing the desired output.' },
    { name: 'image_url', required: true, description: 'Source/reference image; subject identity is preserved.' },
    { name: 'aspect_ratio', required: false, description: 'Output aspect ratio (e.g. "9:16", "16:9", "1:1").' },
    { name: 'seed', required: false, description: 'Integer seed; random when omitted.' },
    { name: 'guidance_scale', required: false, description: 'Guidance scale.' },
    { name: 'num_images', required: false, description: 'Number of images (default 1).' },
  ],
  notes:
    'Image-conditioned generation. Takes a source image + prompt; outputs images[] matching FLUX Pro output shape. Subject identity (product, person) is preserved from the source image while the scene/background follow the prompt.',
};

export const FAL_CONTRACTS = {
  image: FLUX_2_CONTRACT,
  imageCond: FLUX_KONTEXT_CONTRACT,
  video: H3_MAX_I2V_CONTRACT,
  ugc: VEED_FABRIC_CONTRACT,
} as const;

export interface ParsedOutput {
  urls: string[];
  media: ParsedMedia[];
  usage?: MediaUsage;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asMedia(candidate: unknown): ParsedMedia | undefined {
  if (isAcceptableResultUrl(candidate)) return { url: candidate };
  if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;
    for (const key of ['url', 'video_url', 'image_url']) {
      if (isAcceptableResultUrl(obj[key])) {
        return {
          url: obj[key] as string,
          contentType: typeof obj.content_type === 'string' ? obj.content_type : undefined,
          width: numberOrUndefined(obj.width),
          height: numberOrUndefined(obj.height),
          fileSize: numberOrUndefined(obj.file_size),
        };
      }
    }
  }
  return undefined;
}

// ─── Normalized → fal input ───────────────────────────────────────────────────

export function toFluxKontextInput(input: ImageGenerationInput): Record<string, unknown> {
  const imageUrl = input.imageUrls?.[0];
  if (!imageUrl) {
    throw new MediaProviderError('INVALID_REQUEST', 'FLUX Kontext requires a source image URL (imageUrls[0])');
  }
  const payload: Record<string, unknown> = { prompt: input.prompt, image_url: imageUrl };
  // Kontext Pro API accepts ratio strings directly ('9:16', '16:9', etc.)
  if (input.aspectRatio) payload.aspect_ratio = input.aspectRatio;
  if (typeof input.seed === 'number') payload.seed = input.seed;
  return payload;
}

export function toFlux2Input(input: ImageGenerationInput): Record<string, unknown> {
  if (input.imageUrls && input.imageUrls.length > 0) {
    throw new MediaProviderError(
      'UNSUPPORTED',
      'fal-ai/flux-2 is text-to-image; image editing/reference requires a separate edit endpoint',
    );
  }
  const payload: Record<string, unknown> = { prompt: input.prompt };
  if (input.width && input.height) payload.image_size = { width: input.width, height: input.height };
  else if (input.aspectRatio) payload.image_size = aspectToFlux2Size(input.aspectRatio);
  if (typeof input.seed === 'number') payload.seed = input.seed;
  return payload;
}

function aspectToFlux2Size(aspectRatio: NonNullable<ImageGenerationInput['aspectRatio']>): string {
  switch (aspectRatio) {
    case '9:16':
      return 'portrait_16_9';
    case '16:9':
      return 'landscape_16_9';
    case '4:3':
      return 'landscape_4_3';
    case '3:4':
      return 'portrait_4_3';
    case '1:1':
    default:
      return 'square_hd';
  }
}

export function toH3MaxInput(input: VideoGenerationInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { prompt: input.prompt, image_url: input.imageUrl };
  if (input.endImageUrl) payload.end_image_url = input.endImageUrl;
  if (typeof input.durationSeconds === 'number') payload.duration = input.durationSeconds;
  // Endpoint requires the literal enum '480P' | '768P' | '1080P' — normalize and
  // drop invalid values so the provider default applies instead of a 422.
  const resolution = input.resolution?.toUpperCase();
  if (resolution === '480P' || resolution === '768P' || resolution === '1080P') payload.resolution = resolution;
  if (typeof input.seed === 'number') payload.seed = input.seed;
  if (typeof input.promptExpansion === 'boolean') payload.prompt_expansion = input.promptExpansion;
  return payload;
}

export function toVeedFabricInput(input: UGCVideoInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { image_url: input.imageUrl, audio_url: input.audioUrl };
  // resolution is REQUIRED by the endpoint (enum 720p | 480p) — default rather than omit.
  payload.resolution = input.resolution === '480p' || input.resolution === '720p' ? input.resolution : '720p';
  return payload;
}

// ─── fal output → normalized ──────────────────────────────────────────────────

export function parseFlux2Output(raw: unknown): ParsedOutput {
  const obj = raw as Record<string, unknown> | null;
  const images = Array.isArray(obj?.images) ? (obj!.images as unknown[]) : [];
  const media = images.map(asMedia).filter((m): m is ParsedMedia => Boolean(m));
  const seed = numberOrUndefined(obj?.seed);
  const nsfw = Array.isArray(obj?.has_nsfw_concepts) ? (obj!.has_nsfw_concepts as unknown[]).some(Boolean) : false;
  return {
    urls: media.map((m) => m.url),
    media,
    usage: {
      provider: 'fal',
      model: FLUX_2_CONTRACT.endpoint,
      ...(seed !== undefined ? { metrics: { seed, nsfwFlagged: String(nsfw) } } : { metrics: { nsfwFlagged: String(nsfw) } }),
    },
  };
}

export function parseH3MaxOutput(raw: unknown): ParsedOutput {
  const obj = raw as Record<string, unknown> | null;
  const media = asMedia(obj?.video) ?? asMedia(obj);
  return { urls: media ? [media.url] : [], media: media ? [media] : [], usage: { provider: 'fal', model: H3_MAX_I2V_CONTRACT.endpoint } };
}

export function parseVeedFabricOutput(raw: unknown): ParsedOutput {
  const obj = raw as Record<string, unknown> | null;
  const media = asMedia(obj?.video) ?? asMedia(obj);
  return { urls: media ? [media.url] : [], media: media ? [media] : [], usage: { provider: 'fal', model: VEED_FABRIC_CONTRACT.endpoint } };
}
