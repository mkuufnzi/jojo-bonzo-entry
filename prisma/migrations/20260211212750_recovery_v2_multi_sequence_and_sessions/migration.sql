-- DropIndex
DROP INDEX "DunningSequence_businessId_key";

-- AlterTable
ALTER TABLE "DunningAction" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "DunningSequence" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rules" JSONB,
ADD COLUMN     "settings" JSONB;

-- CreateTable
CREATE TABLE "RecoverySession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "externalInvoiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextActionAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoverySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoverySession_businessId_externalInvoiceId_idx" ON "RecoverySession"("businessId", "externalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoverySession_businessId_externalInvoiceId_status_key" ON "RecoverySession"("businessId", "externalInvoiceId", "status");

-- CreateIndex
CREATE INDEX "DunningSequence_businessId_idx" ON "DunningSequence"("businessId");

-- AddForeignKey
ALTER TABLE "RecoverySession" ADD CONSTRAINT "RecoverySession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoverySession" ADD CONSTRAINT "RecoverySession_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "DunningSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningAction" ADD CONSTRAINT "DunningAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecoverySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
