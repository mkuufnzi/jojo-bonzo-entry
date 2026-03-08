-- AddForeignKey
ALTER TABLE "ProcessedDocument" ADD CONSTRAINT "ProcessedDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
