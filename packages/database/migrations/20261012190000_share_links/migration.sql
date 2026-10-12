-- Phase 4b — share links + per-click attribution + daily counts.
--
-- Additive: three brand-new tables. No backfill, no changes to existing tables.
-- camelCase columns (repo convention).
--
-- ShareAttribution has NO IP column — deliberate; the absence is a compliance
-- invariant (design doc §8). Do not add one.
--
-- Prerequisite: apply AFTER 20261012180000_batch_generation.

CREATE TABLE "share_links" (
  "id"        TEXT NOT NULL,
  "videoId"   TEXT NOT NULL,
  "sharerId"  TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "share_links_token_key" ON "share_links" ("token");
CREATE INDEX "share_links_videoId_idx" ON "share_links" ("videoId");
CREATE INDEX "share_links_sharerId_idx" ON "share_links" ("sharerId");

CREATE TABLE "share_attributions" (
  "id"           TEXT NOT NULL,
  "shareLinkId"  TEXT NOT NULL,
  "viewerUserId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "share_attributions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "share_attributions_shareLinkId_createdAt_idx"
  ON "share_attributions" ("shareLinkId", "createdAt");

ALTER TABLE "share_attributions"
  ADD CONSTRAINT "share_attributions_shareLinkId_fkey"
  FOREIGN KEY ("shareLinkId") REFERENCES "share_links" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "share_link_daily_counts" (
  "id"          TEXT NOT NULL,
  "shareLinkId" TEXT NOT NULL,
  "day"         DATE NOT NULL,
  "count"       INTEGER NOT NULL,

  CONSTRAINT "share_link_daily_counts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "share_link_daily_counts_shareLinkId_day_key"
  ON "share_link_daily_counts" ("shareLinkId", "day");

ALTER TABLE "share_link_daily_counts"
  ADD CONSTRAINT "share_link_daily_counts_shareLinkId_fkey"
  FOREIGN KEY ("shareLinkId") REFERENCES "share_links" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
