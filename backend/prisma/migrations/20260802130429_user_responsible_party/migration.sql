-- AlterTable
ALTER TABLE "User" ADD COLUMN     "responsiblePartyId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_responsiblePartyId_fkey" FOREIGN KEY ("responsiblePartyId") REFERENCES "FinanceParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
