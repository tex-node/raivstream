-- D-004: invite codes for self-service onboarding.
--
-- Nullable-add first, backfill, then enforce NOT NULL: Prisma generates cuid()
-- client-side, so there is no database-side default to rely on for existing rows.

ALTER TABLE "raivstream_organizations" ADD COLUMN "inviteCode" TEXT;

UPDATE "raivstream_organizations"
SET "inviteCode" = lower(substr(md5(random()::text || "id" || clock_timestamp()::text), 1, 12))
WHERE "inviteCode" IS NULL;

ALTER TABLE "raivstream_organizations" ALTER COLUMN "inviteCode" SET NOT NULL;

CREATE UNIQUE INDEX "raivstream_organizations_inviteCode_key"
  ON "raivstream_organizations"("inviteCode");