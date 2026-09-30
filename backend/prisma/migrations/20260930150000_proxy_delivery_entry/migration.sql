-- AlterTable: 代管帳號、帳號備註、原始名稱
ALTER TABLE "User" ADD COLUMN "isProxyManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "accountNote" TEXT;
ALTER TABLE "User" ADD COLUMN "originalName" TEXT;

-- AlterTable: 送件紀錄代填者
ALTER TABLE "DeliveryRecord" ADD COLUMN "enteredById" TEXT;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
