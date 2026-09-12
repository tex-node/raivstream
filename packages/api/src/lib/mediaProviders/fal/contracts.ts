/**
 * fal.ai model contracts — normalized, provider-neutral mapping.
 *
 * These are the ONLY places fal's request/response shapes should appear. The
 * mapper outputs are intentionally minimal and MUST be reconciled against the
 * live fal schema before real calls are enabled (fal model schemas evolve).
 *
 * Target models:
 *   - fal-ai/flux-2                  (image create/edit)
 *   - minimax/h3-max/image-to-video  (story image-to-video)
 *   - veed/fabric-1.0                (UGC talking-person video)
 */

import {
  isAcceptableResultUrl,
  type ImageGenerationInput,
  type MediaUsage,
  type UGCVideoInput,
  type VideoGenerationInput,
} from '../types';

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

export const FLUX_2_CONTRACT: ModelContract = {
  endpoint: 'fal-ai/flux-2',
  kind: 'image',
  displayName: 'FLUX.2',
  fields: [
    { name: 'prompt', required: true, description: 'Text prompt for image creation/editing.' },
    { name: 'image_url', required: false, description: 'Optional single input image for edit/reference.' },
    { name: 'image_urls', required: false, description: 'Optional multiple input images.' },
    { name: 'image_size', required: false, description: 'Size preset or {width,height}.' },
    { name: 'num_images', required: false, description: 'Number of output images.' },
    { name: 'seed', required: false, description: 'Deterministic seed.' },
    { name: 'output_format', required: false, description: 'png | jpeg | webp.' },
  ],
  notes: 'Output shape: { images: [{ url, width, height }] }. Variant config must be verified live.',
};

export const H3_MAX_I2V_CONTRACT: ModelContract = {
  endpoint: 'minimax/h3-max/image-to-video',
  kind: 'video',
  displayName: 'MiniMax H3-Max Image-to-Video',
  fields: [
    { name: 'prompt', required: true, description: 'Motion/scene prompt.' },
    { name: 'image_url', required: true, description: 'Opening frame image.' },
    { name: 'end_image_url', required: false, description: 'Optional ending frame.' },
    { name: 'duration', required: false, description: 'Duration in seconds (model-supported values).' },
    { name: 'resolution', required: false, description: 'Output resolution preset.' },
    { name: 'seed', required: false, description: 'Deterministic seed.' },
    { name: 'prompt_expansion', required: false, description: 'Provider-side prompt expansion toggle.' },
  ],
  notes: 'Output shape: { video: { url, ... }, ... }. Timing metadata may be present; verify live.',
};

export const VEED_FABRIC_CONTRACT: ModelContract = {
  endpoint: 'veed/fabric-1.0',
  kind: 'ugc_video',
  displayName: 'VEED Fabric 1.0',
  fields: [
    { name: 'image_url', required: true, description: 'Presenter image (photo or generated).' },
    { name: 'audio_url', required: true, description: 'Speech/audio track to lip-sync against.' },
    { name: 'resolution', required: false, description: 'Output resolution preset.' },
  ],
  notes: 'Output shape: { video: { url } }. Verify live. UGC gating/consent handled above the adapter.',
};

export const FAL_CONTRACTS = {
  image: FLUX_2_CONTRACT,
  video: H3_MAX_I2V_CONTRACT,
  ugc: VEED_FABRIC_CONTRACT,
} as const;

export interface ParsedOutput {
  urls: string[];
  usage?: MediaUsage;
}

function tryExtractUrl(candidate: unknown): string | undefined {
  if (isAcceptableResultUrl(candidate)) return candidate;
  if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;
    for (const key of ['url', 'video_url', 'image_url']) {
      if (isAcceptableResultUrl(obj[key])) return obj[key] as string;
    }
  }
  return undefined;
}

// ─── Normalized → fal input ───────────────────────────────────────────────────

export function toFlux2Input(input: ImageGenerationInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { prompt: input.prompt };
  if (input.imageUrls?.length === 1) payload.image_url = input.imageUrls[0];
  else if (input.imageUrls && input.imageUrls.length > 1) payload.image_urls = input.imageUrls;
  if (input.width && input.height) payload.image_size = { width: input.width, height: input.height };
  else if (input.aspectRatio) payload.image_size = input.aspectRatio;
  if (typeof input.seed === 'number') payload.seed = input.seed;
  return payload;
}

export function toH3MaxInput(input: VideoGenerationInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { prompt: input.prompt, image_url: input.imageUrl };
  if (input.endImageUrl) payload.end_image_url = input.endImageUrl;
  if (typeof input.durationSeconds === 'number') payload.duration = input.durationSeconds;
  if (input.resolution) payload.resolution = input.resolution;
  if (typeof input.seed === 'number') payload.seed = input.seed;
  if (typeof input.promptExpansion === 'boolean') payload.prompt_expansion = input.promptExpansion;
  return payload;
}

export function toVeedFabricInput(input: UGCVideoInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { image_url: input.imageUrl, audio_url: input.audioUrl };
  if (input.resolution) payload.resolution = input.resolution;
  return payload;
}

// ─── fal output → normalized ──────────────────────────────────────────────────

export function parseFlux2Output(raw: unknown): ParsedOutput {
  const obj = raw as Record<string, unknown> | null;
  const images = Array.isArray(obj?.images) ? (obj!.images as unknown[]) : [];
  const urls = images.map(tryExtractUrl).filter((u): u is string => Boolean(u));
  return { urls, usage: { provider: 'fal', model: FLUX_2_CONTRACT.endpoint } };
}

export function parseH3MaxOutput(raw: unknown): ParsedOutput {
  const obj = raw as Record<string, unknown> | null;
  const url = tryExtractUrl(obj?.video) ?? tryExtractUrl(obj);
  return { urls: url ? [url] : [], usage: { provider: 'fal', model: H3_MAX_I2V_CONTRACT.endpoint } };
}

export function parseVeedFabricOutput(raw: unknown): ParsedOutput {
  const obj = raw as Record<string, unknown> | null;
  const url = tryExtractUrl(obj?.video) ?? tryExtractUrl(obj);
  return { urls: url ? [url] : [], usage: { provider: 'fal', model: VEED_FABRIC_CONTRACT.endpoint } };
}
