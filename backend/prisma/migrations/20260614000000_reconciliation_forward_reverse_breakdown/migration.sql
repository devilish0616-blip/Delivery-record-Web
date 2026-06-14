-- AlterTable: 貨運行對帳升級（需求16）- 改以正/逆物流件數與未稅運費收入比對，取代原抽成計算欄位
ALTER TABLE "ReconciliationRecord"
  DROP COLUMN "excelTotalCount",
  DROP COLUMN "excelTotalAmount",
  DROP COLUMN "systemTotalCount",
  DROP COLUMN "commissionRate",
  DROP COLUMN "commissionAmount",
  DROP COLUMN "netAmount",
  DROP COLUMN "countDifference",
  ADD COLUMN     "excelForwardCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "excelReverseCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "excelRevenueBeforeTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN     "systemForwardCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "systemReverseCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "systemRevenueBeforeTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN     "forwardCountDifference" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "reverseCountDifference" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "revenueDifference" DOUBLE PRECISION NOT NULL DEFAULT 0;
