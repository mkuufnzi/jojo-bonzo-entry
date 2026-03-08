/*
  Warnings:

  - You are about to drop the column `amount` on the `UnifiedOrder` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ProcessedDocument" ADD COLUMN     "rawPayload" JSONB;

-- AlterTable
ALTER TABLE "UnifiedOrder" DROP COLUMN "amount",
ADD COLUMN     "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UnifiedProduct" ADD COLUMN     "category" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 0;
