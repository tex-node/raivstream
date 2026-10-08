-- Phase 4 — Animatic → Production Bridge.
-- Links an approved HomerAnimatic to a CreativeProject so the production
-- plan can seed shot.seedImageUrl from the animatic's approved first frames.
-- Additive only — nullable FK, SET NULL on delete, no existing rows affected.

ALTER TABLE "creative_projects"
  ADD COLUMN IF NOT EXISTS "approvedAnimaticId" TEXT;

ALTER TABLE "creative_projects"
  DROP CONSTRAINT IF EXISTS "creative_projects_approvedAnimaticId_fkey";

ALTER TABLE "creative_projects"
  ADD CONSTRAINT "creative_projects_approvedAnimaticId_fkey"
    FOREIGN KEY ("approvedAnimaticId") REFERENCES "homer_animatics"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "creative_projects_approvedAnimaticId_idx"
  ON "creative_projects"("approvedAnimaticId");
