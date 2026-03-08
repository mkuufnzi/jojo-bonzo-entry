-- CreateTable
CREATE TABLE "UnifiedCustomer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "issuedDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedProduct" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "method" TEXT,
    "status" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedShippingNote" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "trackingId" TEXT,
    "carrier" TEXT,
    "status" TEXT NOT NULL,
    "shippedDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedShippingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedEstimate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "estimateNum" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "estimateDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedSyncJob" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnifiedCustomer_businessId_idx" ON "UnifiedCustomer"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedCustomer_businessId_integrationId_externalId_key" ON "UnifiedCustomer"("businessId", "integrationId", "externalId");

-- CreateIndex
CREATE INDEX "UnifiedInvoice_businessId_customerId_idx" ON "UnifiedInvoice"("businessId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedInvoice_businessId_integrationId_externalId_key" ON "UnifiedInvoice"("businessId", "integrationId", "externalId");

-- CreateIndex
CREATE INDEX "UnifiedProduct_businessId_idx" ON "UnifiedProduct"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedProduct_businessId_integrationId_externalId_key" ON "UnifiedProduct"("businessId", "integrationId", "externalId");

-- CreateIndex
CREATE INDEX "UnifiedOrder_businessId_customerId_idx" ON "UnifiedOrder"("businessId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedOrder_businessId_integrationId_externalId_key" ON "UnifiedOrder"("businessId", "integrationId", "externalId");

-- CreateIndex
CREATE INDEX "UnifiedPayment_businessId_customerId_idx" ON "UnifiedPayment"("businessId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedPayment_businessId_integrationId_externalId_key" ON "UnifiedPayment"("businessId", "integrationId", "externalId");

-- CreateIndex
CREATE INDEX "UnifiedShippingNote_businessId_orderId_idx" ON "UnifiedShippingNote"("businessId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedShippingNote_businessId_integrationId_externalId_key" ON "UnifiedShippingNote"("businessId", "integrationId", "externalId");

-- CreateIndex
CREATE INDEX "UnifiedEstimate_businessId_customerId_idx" ON "UnifiedEstimate"("businessId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedEstimate_businessId_integrationId_externalId_key" ON "UnifiedEstimate"("businessId", "integrationId", "externalId");

-- CreateIndex
CREATE INDEX "UnifiedSyncJob_businessId_integrationId_entityType_idx" ON "UnifiedSyncJob"("businessId", "integrationId", "entityType");

-- CreateIndex
CREATE INDEX "UnifiedSyncJob_status_idx" ON "UnifiedSyncJob"("status");

-- AddForeignKey
ALTER TABLE "UnifiedCustomer" ADD CONSTRAINT "UnifiedCustomer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedCustomer" ADD CONSTRAINT "UnifiedCustomer_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedInvoice" ADD CONSTRAINT "UnifiedInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedInvoice" ADD CONSTRAINT "UnifiedInvoice_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedInvoice" ADD CONSTRAINT "UnifiedInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "UnifiedCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedProduct" ADD CONSTRAINT "UnifiedProduct_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedProduct" ADD CONSTRAINT "UnifiedProduct_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedOrder" ADD CONSTRAINT "UnifiedOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedOrder" ADD CONSTRAINT "UnifiedOrder_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedOrder" ADD CONSTRAINT "UnifiedOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "UnifiedCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedPayment" ADD CONSTRAINT "UnifiedPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedPayment" ADD CONSTRAINT "UnifiedPayment_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedPayment" ADD CONSTRAINT "UnifiedPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "UnifiedCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedShippingNote" ADD CONSTRAINT "UnifiedShippingNote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedShippingNote" ADD CONSTRAINT "UnifiedShippingNote_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedShippingNote" ADD CONSTRAINT "UnifiedShippingNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "UnifiedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedEstimate" ADD CONSTRAINT "UnifiedEstimate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedEstimate" ADD CONSTRAINT "UnifiedEstimate_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedEstimate" ADD CONSTRAINT "UnifiedEstimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "UnifiedCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedSyncJob" ADD CONSTRAINT "UnifiedSyncJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedSyncJob" ADD CONSTRAINT "UnifiedSyncJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
