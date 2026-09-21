-- Persisted ProductionManifest (Phase 16.5) — additive.
-- Stores the Stage-2 ProductionManifest JSON (MiniMax H3 + ElevenLabs spec) on
-- story_projects so scene-video generation and the Movie Builder can consume the
-- canonical creative specification. No existing column is altered.

-- AlterTable
ALTER TABLE "story_projects" ADD COLUMN "productionManifest" JSONB;
ALTER TABLE "story_projects" ADD COLUMN "productionManifestUpdatedAt" TIMESTAMP(3);