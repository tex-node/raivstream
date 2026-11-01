-- Phase 3.5 — Watch + Submit Films. ADDITIVE ONLY.
--
-- A film is still a Video. These tables record WHO made it (creator_profiles),
-- THAT it was submitted (film_submissions), WHAT they are owed (revenue_terms)
-- and what was actually paid (film_payouts). No existing column is altered.

CREATE TYPE "FilmSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE IF NOT EXISTS "creator_profiles" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "displayName" TEXT NOT NULL,
  "bio"         TEXT,
  "avatarUrl"   TEXT,
  "socialLinks" JSONB,
  "isVerified"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "revenue_terms" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  -- Basis points (500 = 5.00%). Integer so money is never float-rounded.
  "shareBps"      INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo"   TIMESTAMP(3),
  "createdById"   TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "revenue_terms_effectiveFrom_effectiveTo_idx"
  ON "revenue_terms"("effectiveFrom", "effectiveTo");

CREATE TABLE IF NOT EXISTS "film_submissions" (
  "id"                     TEXT PRIMARY KEY,
  "videoId"                TEXT NOT NULL UNIQUE REFERENCES "videos"("id") ON DELETE CASCADE,
  "submittedById"          TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status"                 "FilmSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "submittedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"             TIMESTAMP(3),
  "reviewedById"           TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "declineReason"          TEXT,
  "contentWarnings"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "credits"                JSONB,
  -- PINS the terms in force at acceptance. Editing revenue_terms later must not
  -- retroactively change what an accepted film is owed.
  "acceptedRevenueTermsId" TEXT REFERENCES "revenue_terms"("id") ON DELETE SET NULL,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "film_submissions_status_submittedAt_idx"
  ON "film_submissions"("status", "submittedAt");
CREATE INDEX IF NOT EXISTS "film_submissions_submittedById_idx"
  ON "film_submissions"("submittedById");

CREATE TABLE IF NOT EXISTS "film_payouts" (
  "id"              TEXT PRIMARY KEY,
  "submissionId"    TEXT NOT NULL REFERENCES "film_submissions"("id") ON DELETE CASCADE,
  -- A LEDGER row: written once from the pinned terms, read thereafter.
  "amountCents"     INTEGER NOT NULL,
  "currency"        TEXT NOT NULL DEFAULT 'NGN',
  "ledgerReference" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "film_payouts_submissionId_idx" ON "film_payouts"("submissionId");