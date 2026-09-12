-- FAL credit operations outbox — additive only.
-- Adds a durable, uniquely-keyed refund intent so the GenerationJob terminal
-- transition and the refund intent commit atomically, and pending refunds
-- survive process crashes and can be retried to completion.
-- No existing table/column is altered.

-- CreateEnum
CREATE TYPE "CreditOperationType" AS ENUM ('REFUND');

-- CreateEnum
CREATE TYPE "CreditOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "credit_operations" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "type" "CreditOperationType" NOT NULL DEFAULT 'REFUND',
    "status" "CreditOperationStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "generationJobId" TEXT,
    "featureKey" TEXT,
    "amount" INTEGER NOT NULL,
    "referenceId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "credit_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_operations_idempotencyKey_key" ON "credit_operations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_operations_status_createdAt_idx" ON "credit_operations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "credit_operations_userId_idx" ON "credit_operations"("userId");

-- CreateIndex
CREATE INDEX "credit_operations_generationJobId_idx" ON "credit_operations"("generationJobId");

-- AddForeignKey
ALTER TABLE "credit_operations" ADD CONSTRAINT "credit_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
