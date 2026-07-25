-- Phase 6B: Story Workspace asset selection and soft asset management.
-- Active image is separate from latest generated image so Storybook can use an older selected version.

ALTER TABLE "story_scene_seeds"
  ADD COLUMN "activeImageAssetId" TEXT;

ALTER TABLE "story_scene_assets"
  ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selectedForStorybookAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "story_scene_assets_sceneId_isFavorite_idx" ON "story_scene_assets"("sceneId", "isFavorite");
CREATE INDEX "story_scene_assets_deletedAt_idx" ON "story_scene_assets"("deletedAt");

