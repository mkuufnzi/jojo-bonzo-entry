-- CreateTable
CREATE TABLE "ProcessedDocument" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "flooviooId" TEXT,
    "n8nExecutionId" TEXT,
    "brandedUrl" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailRecipient" TEXT,
    "emailMessageId" TEXT,
    "processingTimeMs" INTEGER,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "appId" TEXT,
    "businessId" TEXT,
    "actionType" TEXT NOT NULL,
    "serviceId" TEXT,
    "eventType" TEXT,
    "requestPayload" JSONB,
    "requestId" TEXT,
    "responseStatus" INTEGER,
    "responseData" JSONB,
    "durationMs" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedDocument_flooviooId_key" ON "ProcessedDocument"("flooviooId");

-- CreateIndex
CREATE INDEX "ProcessedDocument_businessId_createdAt_idx" ON "ProcessedDocument"("businessId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProcessedDocument_status_idx" ON "ProcessedDocument"("status");

-- CreateIndex
CREATE INDEX "ProcessedDocument_appId_idx" ON "ProcessedDocument"("appId");

-- CreateIndex
CREATE INDEX "ProcessedDocument_userId_idx" ON "ProcessedDocument"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_businessId_timestamp_idx" ON "AuditLog"("businessId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_eventType_idx" ON "AuditLog"("eventType");

-- CreateIndex
CREATE INDEX "AuditLog_actionType_idx" ON "AuditLog"("actionType");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- AddForeignKey
ALTER TABLE "ProcessedDocument" ADD CONSTRAINT "ProcessedDocument_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedDocument" ADD CONSTRAINT "ProcessedDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
