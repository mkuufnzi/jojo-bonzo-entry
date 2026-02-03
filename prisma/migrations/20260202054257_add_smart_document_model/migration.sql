-- CreateTable
CREATE TABLE "SmartDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "documentNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB NOT NULL,
    "theme" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmartDocument_userId_type_idx" ON "SmartDocument"("userId", "type");

-- AddForeignKey
ALTER TABLE "SmartDocument" ADD CONSTRAINT "SmartDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
