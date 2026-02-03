/*
  Warnings:

  - You are about to drop the column `status` on the `UserTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `thumbnailUrl` on the `UserTemplate` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserTemplate" DROP CONSTRAINT "UserTemplate_businessId_fkey";

-- AlterTable
ALTER TABLE "UserTemplate" DROP COLUMN "status",
DROP COLUMN "thumbnailUrl",
ADD COLUMN     "baseTemplateId" TEXT,
ADD COLUMN     "config" JSONB,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "htmlContent" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "UserTemplate_businessId_idx" ON "UserTemplate"("businessId");

-- AddForeignKey
ALTER TABLE "UserTemplate" ADD CONSTRAINT "UserTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
