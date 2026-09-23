/**
 * Creator-facing capability facts mirrored from the backend CapabilityRouter.
 *
 * The 5.0 pipeline produces stills (FLUX2) and image-to-video clips (MiniMax H3
 * I2V). It does NOT support video-to-video, so a Transform source must be an
 * IMAGE. The readiness UI must never offer a media type the backend cannot
 * process.
 */
export const TRANSFORM_SOURCE_KINDS = ['image'] as const;
export type TransformSourceKind = (typeof TRANSFORM_SOURCE_KINDS)[number];

export function transformAcceptsVideo(): boolean {
  return (TRANSFORM_SOURCE_KINDS as readonly string[]).includes('video');
}
