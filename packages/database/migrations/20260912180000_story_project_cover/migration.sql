-- Project cover image (Phase 11) — additive.
-- Adds an optional cover asset reference (a READY scene image) to story_projects.

-- AlterTable
ALTER TABLE "story_projects" ADD COLUMN "coverAssetId" TEXT;

-- CreateIndex
CREATE INDEX "story_projects_coverAssetId_idx" ON "story_projects"("coverAssetId");

-- AddForeignKey
ALTER TABLE "story_projects" ADD CONSTRAINT "story_projects_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "story_scene_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
