-- AlterTable
ALTER TABLE "DebtCollectionCustomer" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "DebtCollectionCustomerProfile" (
    "id" TEXT NOT NULL,
    "debtCustomerId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "lifetimeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPurchases" INTEGER NOT NULL DEFAULT 0,
    "paymentFrequencyDays" DOUBLE PRECISION,
    "creditLimit" DOUBLE PRECISION,
    "riskScore" TEXT NOT NULL DEFAULT 'LOW',
    "clusterId" TEXT,
    "lastEnrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionCustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionCluster" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleLogic" JSONB NOT NULL,
    "sequenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCollectionCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtCollectionStateHistory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "reason" TEXT,
    "triggerSource" TEXT NOT NULL DEFAULT 'SYSTEM',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtCollectionStateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DebtCollectionCustomerProfile_debtCustomerId_key" ON "DebtCollectionCustomerProfile"("debtCustomerId");

-- CreateIndex
CREATE INDEX "DebtCollectionCustomerProfile_businessId_idx" ON "DebtCollectionCustomerProfile"("businessId");

-- CreateIndex
CREATE INDEX "DebtCollectionCustomerProfile_clusterId_idx" ON "DebtCollectionCustomerProfile"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtCollectionCluster_sequenceId_key" ON "DebtCollectionCluster"("sequenceId");

-- CreateIndex
CREATE INDEX "DebtCollectionCluster_businessId_idx" ON "DebtCollectionCluster"("businessId");

-- CreateIndex
CREATE INDEX "DebtCollectionStateHistory_sessionId_idx" ON "DebtCollectionStateHistory"("sessionId");

-- CreateIndex
CREATE INDEX "DebtCollectionStateHistory_timestamp_idx" ON "DebtCollectionStateHistory"("timestamp");

-- AddForeignKey
ALTER TABLE "DebtCollectionCustomer" ADD CONSTRAINT "DebtCollectionCustomer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionCustomerProfile" ADD CONSTRAINT "DebtCollectionCustomerProfile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionCustomerProfile" ADD CONSTRAINT "DebtCollectionCustomerProfile_debtCustomerId_fkey" FOREIGN KEY ("debtCustomerId") REFERENCES "DebtCollectionCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionCustomerProfile" ADD CONSTRAINT "DebtCollectionCustomerProfile_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "DebtCollectionCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionCluster" ADD CONSTRAINT "DebtCollectionCluster_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionCluster" ADD CONSTRAINT "DebtCollectionCluster_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "DebtCollectionSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionInvoice" ADD CONSTRAINT "DebtCollectionInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCollectionStateHistory" ADD CONSTRAINT "DebtCollectionStateHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DebtCollectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
