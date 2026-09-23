-- Raivstream 5.0 — Creative Foundation (Phase 0/1).
-- Additive only; existing Story infrastructure is untouched. The legacy
-- StoryProject is bridged via creative_projects.legacyStoryProjectId (nullable).
-- Columns follow the repo's camelCase convention (see SESSION.md incident note).
-- Tables use snake_case names via Prisma @@map.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeProjectType') THEN
    CREATE TYPE "CreativeProjectType" AS ENUM ('STORY', 'EDUCATION', 'COMMERCIAL', 'TRANSFORMATION', 'UNKNOWN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeProjectStatus') THEN
    CREATE TYPE "CreativeProjectStatus" AS ENUM ('IDEA', 'INTERPRETING', 'PLANNING', 'PREVIEW', 'DIRECTING', 'GENERATING', 'REVIEW', 'REFINING', 'APPROVED', 'PUBLISHED', 'ARCHIVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeMemoryKind') THEN
    CREATE TYPE "CreativeMemoryKind" AS ENUM ('PREFERENCE', 'DECISION', 'REJECTION', 'NOTE', 'DIRECTION');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "creative_projects" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "projectType" "CreativeProjectType" NOT NULL DEFAULT 'UNKNOWN',
  "status" "CreativeProjectStatus" NOT NULL DEFAULT 'IDEA',
  "legacyStoryProjectId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_projects_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "creative_projects_userId_idx" ON "creative_projects"("userId");
CREATE INDEX IF NOT EXISTS "creative_projects_status_idx" ON "creative_projects"("status");
CREATE INDEX IF NOT EXISTS "creative_projects_legacyStoryProjectId_idx" ON "creative_projects"("legacyStoryProjectId");

CREATE TABLE IF NOT EXISTS "creative_briefs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "originalIntent" TEXT NOT NULL,
  "refinedIntent" TEXT,
  "objective" TEXT,
  "audience" TEXT,
  "format" TEXT,
  "durationSeconds" INTEGER,
  "genre" TEXT,
  "tone" TEXT,
  "theme" TEXT,
  "setting" TEXT,
  "attachments" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_briefs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_briefs_projectId_key" UNIQUE ("projectId"),
  CONSTRAINT "creative_briefs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "creative_bibles" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "story" JSONB,
  "characters" JSONB,
  "worlds" JSONB,
  "visualLanguage" JSONB,
  "audioLanguage" JSONB,
  "audience" JSONB,
  "brand" JSONB,
  "constraints" JSONB,
  "canon" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_bibles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_bibles_projectId_key" UNIQUE ("projectId"),
  CONSTRAINT "creative_bibles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "creative_memories" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind" "CreativeMemoryKind" NOT NULL,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_memories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_memories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_memories_projectId_idx" ON "creative_memories"("projectId");