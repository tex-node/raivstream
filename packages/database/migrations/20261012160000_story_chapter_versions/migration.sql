-- Phase 2 (R16-05) — chapter version history.
--
-- Additive: a brand-new table. Existing chapters simply have no history rows.
-- No backfill, no changes to `story_chapters`. camelCase columns (repo convention;
-- see the snake_case production incident in session.md).
--
-- Prerequisite: apply AFTER 20261012150000_phase4a_video_publication.

CREATE TABLE "story_chapter_versions" (
  "id"              TEXT NOT NULL,
  "chapterId"       TEXT NOT NULL,
  "versionNumber"   INTEGER NOT NULL,
  "title"           TEXT,
  "summary"         TEXT,
  "body"            TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "source"          TEXT NOT NULL,
  "sourceMetadata"  JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "story_chapter_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "story_chapter_versions_chapterId_versionNumber_key"
  ON "story_chapter_versions" ("chapterId", "versionNumber");

CREATE INDEX "story_chapter_versions_chapterId_createdAt_idx"
  ON "story_chapter_versions" ("chapterId", "createdAt");

ALTER TABLE "story_chapter_versions"
  ADD CONSTRAINT "story_chapter_versions_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "story_chapters" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
