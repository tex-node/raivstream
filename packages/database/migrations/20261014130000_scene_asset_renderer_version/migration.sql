-- Track D Layer 1 — scene-image renderer provenance.
-- One additive nullable column on story_scene_assets: which renderer produced the
-- asset (text-only FLUX.2 vs reference-conditioned fal-ai/flux-2/edit). Provenance
-- only; not a cache key. No backfill.
ALTER TABLE "story_scene_assets" ADD COLUMN IF NOT EXISTS "rendererVersion" TEXT;
