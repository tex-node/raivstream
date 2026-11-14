/**
 * The kling video-to-video edit body, and the shape check that runs before any charge (2026-11-14).
 *
 * WHY THIS EXISTS. The shared `VideoGenerationInput` cannot express a relight: it **requires** `imageUrl`
 * (an opening frame), has **no** `videoUrl`, and `submitVideo` dispatches to a **constant**
 * `config.endpoints.video` built through `toH3MaxInput`. A video-to-video edit is a different operation,
 * not a different value of the same one - so it gets its own body and its own preflight rather than a new
 * optional field on a type every video path reads.
 *
 * The preflight is the moderation pattern applied to shape: a rejection that costs nothing beats a
 * rejection that costs 5,260 credits. It runs locally, before the charge, and it is the last thing that can
 * fail without spending.
 */

export class TransformShapeError extends Error {
  constructor(message: string) {
    super(`TRANSFORM_BODY_INVALID: ${message}`);
    this.name = 'TransformShapeError';
  }
}

export interface KlingEditSpec {
  videoUrl: string;
  prompt: string;
  resolution: string;
  /** Output duration; the contract accepts 3-30 s and defaults to the source length. */
  durationSeconds: number;
  /** Optional reference images, up to 10 on the verified contract. */
  imageUrls?: string[];
}

const RESOLUTIONS = new Set(['720p', '1080p']);
const MIN_SECONDS = 3;
const MAX_SECONDS = 30;

/**
 * Validate against the VERIFIED contract (required `prompt` + `video_url`, optional refs, 3-30 s,
 * 720p/1080p). Throws `TransformShapeError` - a typed, cheap failure - instead of submitting a body the
 * provider would reject after the charge.
 */
export function assertKlingEditShape(spec: KlingEditSpec): void {
  if (!spec.videoUrl || !/^https?:\/\//.test(spec.videoUrl)) {
    throw new TransformShapeError('videoUrl must be an absolute http(s) URL');
  }
  if (!spec.prompt || spec.prompt.trim().length === 0) {
    throw new TransformShapeError('prompt is required by the edit contract');
  }
  if (!RESOLUTIONS.has(spec.resolution)) {
    throw new TransformShapeError(`resolution must be one of 720p, 1080p (got ${spec.resolution})`);
  }
  if (!Number.isFinite(spec.durationSeconds) || spec.durationSeconds < MIN_SECONDS || spec.durationSeconds > MAX_SECONDS) {
    throw new TransformShapeError(`durationSeconds must be ${MIN_SECONDS}-${MAX_SECONDS} (got ${String(spec.durationSeconds)})`);
  }
  if (spec.imageUrls && spec.imageUrls.length > 10) {
    throw new TransformShapeError('at most 10 reference images are accepted');
  }
}

/** Build the body the contract expects, after validating it. */
export function toKlingEditBody(spec: KlingEditSpec): Record<string, unknown> {
  assertKlingEditShape(spec);
  return {
    prompt: spec.prompt,
    video_url: spec.videoUrl,
    resolution: spec.resolution,
    duration: Math.round(spec.durationSeconds),
    ...(spec.imageUrls?.length ? { image_urls: spec.imageUrls } : {}),
  };
}
