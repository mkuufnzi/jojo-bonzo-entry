-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ServiceConfigVersion" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceConfigVersion_serviceId_idx" ON "ServiceConfigVersion"("serviceId");

-- AddForeignKey
ALTER TABLE "ServiceConfigVersion" ADD CONSTRAINT "ServiceConfigVersion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
