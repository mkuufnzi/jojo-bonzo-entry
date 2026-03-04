/*
  Warnings:

  - You are about to drop the `DunningAction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DunningSequence` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RecoverySession` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DunningAction" DROP CONSTRAINT "DunningAction_businessId_fkey";

-- DropForeignKey
ALTER TABLE "DunningAction" DROP CONSTRAINT "DunningAction_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "DunningSequence" DROP CONSTRAINT "DunningSequence_businessId_fkey";

-- DropForeignKey
ALTER TABLE "RecoverySession" DROP CONSTRAINT "RecoverySession_businessId_fkey";

-- DropForeignKey
ALTER TABLE "RecoverySession" DROP CONSTRAINT "RecoverySession_sequenceId_fkey";

-- DropTable
DROP TABLE "DunningAction";

-- DropTable
DROP TABLE "DunningSequence";

-- DropTable
DROP TABLE "RecoverySession";

-- CreateTable
CREATE TABLE "DebtCollectionSequence" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Recovery',
    "steps" JSONB NOT NULL,
    "settings" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "externalInvoiceId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextActionAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionCustomer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "lifetimeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalInvoices" INTEGER NOT NULL DEFAULT 0,
    "unpaidInvoices" INTEGER NOT NULL DEFAULT 0,
    "riskScore" TEXT NOT NULL DEFAULT 'Unknown',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "issuedDate" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionAction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sessionId" TEXT,
    "externalInvoiceId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "aiGeneratedCopy" TEXT,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtCollectionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionSequenceStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "templateId" TEXT,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionSequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionSequenceRule" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "conditionField" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionSequenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionMessageTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "mergeVariables" JSONB,
    "tone" TEXT NOT NULL DEFAULT 'Neutral',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionMessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionCommunicationLog" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "providerResponse" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtCollectionCommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionTask" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionDispute" (
    "id" TEXT NOT NULL,
    "invoiceExternalId" TEXT NOT NULL,
    "customerExternalId" TEXT,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reasonCategoryId" TEXT,
    "details" TEXT NOT NULL,
    "resolutionNotes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DebtCollectionDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionPromiseToPay" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "invoiceExternalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "promisedAmount" DOUBLE PRECISION NOT NULL,
    "promisedDate" TIMESTAMP(3) NOT NULL,
    "terms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionPromiseToPay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionPartialPayment" (
    "id" TEXT NOT NULL,
    "invoiceExternalId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncStatus" TEXT NOT NULL DEFAULT 'LOCAL',

    CONSTRAINT "DebtCollectionPartialPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionAuditLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "event" TEXT NOT NULL,
    "reason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtCollectionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebtCollectionSequence_businessId_idx" ON "DebtCollectionSequence"("businessId");

-- CreateIndex
CREATE INDEX "DebtCollectionSession_businessId_externalInvoiceId_idx" ON "DebtCollectionSession"("businessId", "externalInvoiceId");

-- CreateIndex
CREATE INDEX "DebtCollectionSession_businessId_customerId_idx" ON "DebtCollectionSession"("businessId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtCollectionSession_businessId_externalInvoiceId_status_key" ON "DebtCollectionSession"("businessId", "externalInvoiceId", "status");

-- CreateIndex
CREATE INDEX "DebtCollectionCustomer_businessId_idx" ON "DebtCollectionCustomer"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtCollectionCustomer_businessId_externalId_key" ON "DebtCollectionCustomer"("businessId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtCollectionInvoice_externalId_key" ON "DebtCollectionInvoice"("externalId");

-- CreateIndex
CREATE INDEX "DebtCollectionInvoice_businessId_customerId_idx" ON "DebtCollectionInvoice"("businessId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtCollectionInvoice_businessId_externalId_key" ON "DebtCollectionInvoice"("businessId", "externalId");

-- CreateIndex
CREATE INDEX "DebtCollectionAction_businessId_externalInvoiceId_idx" ON "DebtCollectionAction"("businessId", "externalInvoiceId");

-- CreateIndex
CREATE INDEX "DebtCollectionSequenceStep_sequenceId_idx" ON "DebtCollectionSequenceStep"("sequenceId");

-- CreateIndex
CREATE INDEX "DebtCollectionSequenceRule_sequenceId_idx" ON "DebtCollectionSequenceRule"("sequenceId");

-- CreateIndex
CREATE INDEX "DebtCollectionMessageTemplate_businessId_idx" ON "DebtCollectionMessageTemplate"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtCollectionCommunicationLog_actionId_key" ON "DebtCollectionCommunicationLog"("actionId");

-- CreateIndex
CREATE INDEX "DebtCollectionTask_businessId_status_idx" ON "DebtCollectionTask"("businessId", "status");

-- CreateIndex
CREATE INDEX "DebtCollectionTask_sessionId_idx" ON "DebtCollectionTask"("sessionId");

-- CreateIndex
CREATE INDEX "DebtCollectionDispute_invoiceExternalId_status_idx" ON "DebtCollectionDispute"("invoiceExternalId", "status");

-- CreateIndex
CREATE INDEX "DebtCollectionPromiseToPay_sessionId_idx" ON "DebtCollectionPromiseToPay"("sessionId");

-- CreateIndex
CREATE INDEX "DebtCollectionPromiseToPay_invoiceExternalId_idx" ON "DebtCollectionPromiseToPay"("invoiceExternalId");

-- CreateIndex
CREATE INDEX "DebtCollectionPartialPayment_invoiceExternalId_idx" ON "DebtCollectionPartialPayment"("invoiceExternalId");

-- CreateIndex
CREATE INDEX "DebtCollectionAuditLog_sessionId_idx" ON "DebtCollectionAuditLog"("sessionId");

-- CreateIndex
CREATE INDEX "DebtCollectionAuditLog_timestamp_idx" ON "DebtCollectionAuditLog"("timestamp");

-- AddForeignKey
ALTER TABLE "DebtCollectionSequence" ADD CONSTRAINT "DebtCollectionSequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionSession" ADD CONSTRAINT "DebtCollectionSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionSession" ADD CONSTRAINT "DebtCollectionSession_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "DebtCollectionSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionInvoice" ADD CONSTRAINT "DebtCollectionInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "DebtCollectionCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionAction" ADD CONSTRAINT "DebtCollectionAction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionAction" ADD CONSTRAINT "DebtCollectionAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DebtCollectionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionSequenceStep" ADD CONSTRAINT "DebtCollectionSequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "DebtCollectionSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionSequenceStep" ADD CONSTRAINT "DebtCollectionSequenceStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DebtCollectionMessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionSequenceRule" ADD CONSTRAINT "DebtCollectionSequenceRule_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "DebtCollectionSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionMessageTemplate" ADD CONSTRAINT "DebtCollectionMessageTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionCommunicationLog" ADD CONSTRAINT "DebtCollectionCommunicationLog_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "DebtCollectionAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionTask" ADD CONSTRAINT "DebtCollectionTask_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionTask" ADD CONSTRAINT "DebtCollectionTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DebtCollectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionTask" ADD CONSTRAINT "DebtCollectionTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionDispute" ADD CONSTRAINT "DebtCollectionDispute_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DebtCollectionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionPromiseToPay" ADD CONSTRAINT "DebtCollectionPromiseToPay_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DebtCollectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionAuditLog" ADD CONSTRAINT "DebtCollectionAuditLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DebtCollectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
