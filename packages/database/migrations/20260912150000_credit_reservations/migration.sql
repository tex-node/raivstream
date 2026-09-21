-- Credit reservation lifecycle (Phase §7.5) — additive only.
-- Adds a durable, uniquely-keyed reservation so the reserve → settle → release
-- pattern is crash-safe and idempotent. No existing table/column is altered.

-- CreateEnum
CREATE TYPE "CreditReservationStatus" AS ENUM ('HELD', 'SETTLED', 'RELEASED');

-- CreateTable
CREATE TABLE "credit_reservations" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "CreditReservationStatus" NOT NULL DEFAULT 'HELD',
    "userId" TEXT NOT NULL,
    "generationJobId" TEXT,
    "featureKey" TEXT,
    "amount" INTEGER NOT NULL,
    "settledAmount" INTEGER,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_reservations_idempotencyKey_key" ON "credit_reservations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_reservations_status_createdAt_idx" ON "credit_reservations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "credit_reservations_userId_idx" ON "credit_reservations"("userId");

-- AddForeignKey
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
