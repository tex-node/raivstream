DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoryMovieStatus') THEN
    CREATE TYPE "StoryMovieStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
  END IF;
END $$;

ALTER TABLE "story_scene_seeds"
  ADD COLUMN IF NOT EXISTS "latestVideoAssetId" TEXT,
  ADD COLUMN IF NOT EXISTS "videoStatus" "StorySceneAssetStatus",
  ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;

CREATE TABLE IF NOT EXISTS "story_movies" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "StoryMovieStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "r2Key" TEXT,
  "movieUrl" TEXT,
  "thumbnailUrl" TEXT,
  "durationSeconds" DOUBLE PRECISION,
  "sceneAssetIds" JSONB NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "story_movies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "story_movies_projectId_idx" ON "story_movies"("projectId");
CREATE INDEX IF NOT EXISTS "story_movies_userId_idx" ON "story_movies"("userId");
CREATE INDEX IF NOT EXISTS "story_movies_status_idx" ON "story_movies"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_movies_projectId_fkey') THEN
    ALTER TABLE "story_movies"
      ADD CONSTRAINT "story_movies_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "story_projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_movies_userId_fkey') THEN
    ALTER TABLE "story_movies"
      ADD CONSTRAINT "story_movies_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
