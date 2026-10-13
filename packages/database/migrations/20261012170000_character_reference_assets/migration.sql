-- Phase 2 (R16-03) — character reference assets + approval.
--
-- Additive: a brand-new table plus two nullable columns on story_character_memory.
-- No backfill (existing characters simply have no reference / no approval).
-- camelCase columns (repo convention; see the snake_case incident in session.md).
--
-- Prerequisite: apply AFTER 20261012160000_story_chapter_versions.

CREATE TYPE "CharacterReferenceStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

CREATE TABLE "character_reference_assets" (
  "id"              TEXT NOT NULL,
  "characterId"     TEXT NOT NULL,
  "projectId"       TEXT NOT NULL,
  "status"          "CharacterReferenceStatus" NOT NULL DEFAULT 'PENDING',
  "assetUrl"        TEXT,
  "prompt"          TEXT NOT NULL,
  "negativePrompt"  TEXT,
  "providerModel"   TEXT NOT NULL DEFAULT 'FLUX2',
  "generationJobId" TEXT,
  "errorMessage"    TEXT,
  "isLatest"        BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "character_reference_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "character_reference_assets_characterId_isLatest_idx"
  ON "character_reference_assets" ("characterId", "isLatest");
CREATE INDEX "character_reference_assets_projectId_status_idx"
  ON "character_reference_assets" ("projectId", "status");

ALTER TABLE "character_reference_assets"
  ADD CONSTRAINT "character_reference_assets_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "story_character_memory" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_character_memory"
  ADD COLUMN "approvedReferenceAssetId" TEXT,
  ADD COLUMN "approvedAt"               TIMESTAMP(3);
