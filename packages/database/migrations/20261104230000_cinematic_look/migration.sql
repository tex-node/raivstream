-- Cinematic look persistence (Phase 5)
--
-- A look is a first-class object: lens, movement, lighting, grade, resolution ladder. Scoped to
-- the PROJECT, not the user - "reusable" means reusable across every production in one film, and
-- a name collision inside a project is a conflict to surface rather than a second row.
--
-- Additive: a new table with no backfill and no changes to existing columns.

CREATE TABLE IF NOT EXISTS "cinematic_looks" (
  "id"         TEXT NOT NULL,
  "projectId"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "lens"       INTEGER NOT NULL,
  "movement"   TEXT NOT NULL,
  "lighting"   TEXT NOT NULL,
  "grade"      TEXT NOT NULL,
  "resolution" INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cinematic_looks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cinematic_looks_projectId_name_key"
  ON "cinematic_looks" ("projectId", "name");

CREATE INDEX IF NOT EXISTS "cinematic_looks_projectId_idx"
  ON "cinematic_looks" ("projectId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cinematic_looks_projectId_fkey'
  ) THEN
    ALTER TABLE "cinematic_looks"
      ADD CONSTRAINT "cinematic_looks_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;