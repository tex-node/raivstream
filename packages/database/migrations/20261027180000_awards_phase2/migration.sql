-- D-004 Phase 2: award categories + nominations (additive).
--
-- Namespaced per the Shared Postgres Prefix Rule (D-084): this database is shared
-- with UltraLeague and Powervend, so tables are `raivstream_*` and the enum types
-- are `Raiv*`. Both names were verified free with pg_tables / pg_type first.

CREATE TYPE "RaivAwardNominationStatus" AS ENUM ('PENDING', 'SHORTLISTED', 'WINNER', 'REJECTED');
CREATE TYPE "RaivAwardNominationTargetType" AS ENUM ('VIDEO', 'EXPORT');

CREATE TABLE "raivstream_award_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "raivstream_award_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "raivstream_award_nominations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "targetType" "RaivAwardNominationTargetType" NOT NULL,
    "videoId" TEXT,
    "storyVideoExportId" TEXT,
    "nominatedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "status" "RaivAwardNominationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "raivstream_award_nominations_pkey" PRIMARY KEY ("id")
);

-- One nomination per (category, target). Postgres treats NULLs as distinct, so
-- the two unique indexes do not collide with each other.
CREATE UNIQUE INDEX "raivstream_award_nominations_categoryId_videoId_key"
  ON "raivstream_award_nominations"("categoryId", "videoId");
CREATE UNIQUE INDEX "raivstream_award_nominations_categoryId_storyVideoExportId_key"
  ON "raivstream_award_nominations"("categoryId", "storyVideoExportId");
CREATE INDEX "raivstream_award_nominations_organizationId_status_idx"
  ON "raivstream_award_nominations"("organizationId", "status");

ALTER TABLE "raivstream_award_nominations"
  ADD CONSTRAINT "raivstream_award_nominations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "raivstream_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "raivstream_award_nominations"
  ADD CONSTRAINT "raivstream_award_nominations_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "raivstream_award_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "raivstream_award_nominations"
  ADD CONSTRAINT "raivstream_award_nominations_videoId_fkey"
  FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "raivstream_award_nominations"
  ADD CONSTRAINT "raivstream_award_nominations_storyVideoExportId_fkey"
  FOREIGN KEY ("storyVideoExportId") REFERENCES "story_video_exports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "raivstream_award_nominations"
  ADD CONSTRAINT "raivstream_award_nominations_nominatedByUserId_fkey"
  FOREIGN KEY ("nominatedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;