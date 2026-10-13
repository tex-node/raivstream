/**
 * Scene-image renderer version — Track D Layer 1 provenance.
 *
 * Recorded on `StorySceneAsset` rows so we can tell which renderer produced an
 * image (text-only FLUX.2 vs reference-conditioned `fal-ai/flux-2/edit`). This is
 * PROVENANCE, not a cache key: scene-image assets are per-asset (each generation
 * creates a new row) and are not deduplicated by input hash, so there is no cache
 * to invalidate here — the version is for observability/auditing only.
 *
 * `phase-d1-v1`: Track D Layer 1 — reference-conditioned scene images via
 * `fal-ai/flux-2/edit` when a scene's locked characters have approved references.
 */
export const SCENE_IMAGE_RENDERER_VERSION = 'phase-d1-v1';
