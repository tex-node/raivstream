-- Raivstream 5.0 — Slice 5 (5A APPROVAL): version-specific approval state.
-- Additive only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeApprovalKind') THEN
    CREATE TYPE "CreativeApprovalKind" AS ENUM ('CREATIVE', 'PRODUCTION', 'OUTPUT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeApprovalStatus') THEN
    CREATE TYPE "CreativeApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'INVALIDATED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "creative_approvals" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "kind" "CreativeApprovalKind" NOT NULL,
  "status" "CreativeApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decidedById" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_approvals_versionId_kind_key" UNIQUE ("versionId", "kind"),
  CONSTRAINT "creative_approvals_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "creative_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "creative_approvals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_approvals_projectId_idx" ON "creative_approvals"("projectId");