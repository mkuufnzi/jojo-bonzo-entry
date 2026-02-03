-- AlterTable
ALTER TABLE "BrandingProfile" ADD COLUMN     "activeTemplateId" TEXT NOT NULL DEFAULT 'smart_invoice_v1',
ADD COLUMN     "components" JSONB;
