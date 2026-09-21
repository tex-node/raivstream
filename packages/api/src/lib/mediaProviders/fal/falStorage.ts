/**
 * fal.ai output persistence — canonical R2 mirroring for fal generation output.
 *
 * Single source of truth for the R2 storage key/content-type used by BOTH the
 * polling path (generator adapters) and the webhook completion path, so the two
 * produce identical permanent URLs for the same request.
 *
 * Provider CDN URLs (fal.media / v3.fal.media) are never persisted as permanent
 * assets; everything is mirrored to R2 via `mirrorUrlToR2`.
 */

import type { MediaKind } from '../types';
import { mirrorUrlToR2 } from '../../r2';

const KIND_DIR: Record<MediaKind, { dir: string; ext: string; contentType: string }> = {
  image: { dir: 'flux2', ext: 'png', contentType: 'image/png' },
  video: { dir: 'h3max', ext: 'mp4', contentType: 'video/mp4' },
  ugc_video: { dir: 'veed', ext: 'mp4', contentType: 'video/mp4' },
};

/** Model key (GenerationJob.model) → media kind, for fal models only. */
const MODEL_KIND: Record<string, MediaKind> = {
  FLUX2: 'image',
  H3_MAX: 'video',
  VEED_FABRIC: 'ugc_video',
};

export function falKindForModel(model: string): MediaKind | undefined {
  return MODEL_KIND[model];
}

export function falOutputStorageKey(kind: MediaKind, requestId: string): string {
  const { dir, ext } = KIND_DIR[kind];
  return `generated/fal/${dir}/${requestId}.${ext}`;
}

/** Mirror a fal output URL to R2 and return the permanent public URL. */
export async function persistFalOutput(kind: MediaKind, requestId: string, sourceUrl: string): Promise<string> {
  const { contentType } = KIND_DIR[kind];
  return mirrorUrlToR2(sourceUrl, falOutputStorageKey(kind, requestId), contentType);
}
