/*
  Warnings:

  - You are about to drop the column `userId` on the `BrandingProfile` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Integration` table. All the data in the column will be lost.
  - You are about to drop the column `businessAddress` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessCity` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessCountry` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessName` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessSector` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessState` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessTaxId` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessWebsite` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessZip` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Workflow` table. All the data in the column will be lost.
  - Added the required column `businessId` to the `BrandingProfile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `businessId` to the `Integration` table without a default value. This is not possible if the table is not empty.
  - Added the required column `businessId` to the `Workflow` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BrandingProfile" DROP CONSTRAINT "BrandingProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "Integration" DROP CONSTRAINT "Integration_userId_fkey";

-- DropForeignKey
ALTER TABLE "Workflow" DROP CONSTRAINT "Workflow_userId_fkey";

-- DropIndex
DROP INDEX "BrandingProfile_userId_idx";

-- DropIndex
DROP INDEX "Integration_userId_idx";

-- DropIndex
DROP INDEX "Workflow_userId_idx";

-- AlterTable
ALTER TABLE "BrandingProfile" DROP COLUMN "userId",
ADD COLUMN     "businessId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Integration" DROP COLUMN "userId",
ADD COLUMN     "businessId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "businessId" TEXT;

-- AlterTable
ALTER TABLE "UserProfile" DROP COLUMN "businessAddress",
DROP COLUMN "businessCity",
DROP COLUMN "businessCountry",
DROP COLUMN "businessName",
DROP COLUMN "businessSector",
DROP COLUMN "businessState",
DROP COLUMN "businessTaxId",
DROP COLUMN "businessWebsite",
DROP COLUMN "businessZip";

-- AlterTable
ALTER TABLE "Workflow" DROP COLUMN "userId",
ADD COLUMN     "businessId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "taxId" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandingProfile_businessId_idx" ON "BrandingProfile"("businessId");

-- CreateIndex
CREATE INDEX "Integration_businessId_idx" ON "Integration"("businessId");

-- CreateIndex
CREATE INDEX "Workflow_businessId_idx" ON "Workflow"("businessId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandingProfile" ADD CONSTRAINT "BrandingProfile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
