-- CreateIndex
CREATE INDEX "UsageLog_userId_serviceId_resourceType_createdAt_idx" ON "UsageLog"("userId", "serviceId", "resourceType", "createdAt");

-- CreateIndex
CREATE INDEX "UsageLog_userId_createdAt_idx" ON "UsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageLog_serviceId_status_idx" ON "UsageLog"("serviceId", "status");
