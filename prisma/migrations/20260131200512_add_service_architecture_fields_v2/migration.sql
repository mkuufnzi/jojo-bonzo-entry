-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "defaultConfig" JSONB,
ADD COLUMN     "defaultScopes" JSONB,
ADD COLUMN     "dependencies" JSONB,
ADD COLUMN     "endpoints" JSONB,
ADD COLUMN     "healthCheckUrl" TEXT,
ADD COLUMN     "provides" JSONB,
ADD COLUMN     "requires" JSONB,
ADD COLUMN     "scalingConfig" JSONB,
ADD COLUMN     "tier" TEXT NOT NULL DEFAULT 'core';

-- CreateIndex
CREATE INDEX "Service_tier_slug_idx" ON "Service"("tier", "slug");
