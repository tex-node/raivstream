-- Google OAuth account linking — additive only.
-- Adds an optional unique googleId to users and allows NULL passwordHash for
-- Google-only accounts (no password set). Existing password accounts untouched.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
