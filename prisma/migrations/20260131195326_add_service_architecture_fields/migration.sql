/*
  Warnings:

  - Made the column `appId` on table `ProcessedDocument` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ProcessedDocument" ALTER COLUMN "appId" SET NOT NULL;
