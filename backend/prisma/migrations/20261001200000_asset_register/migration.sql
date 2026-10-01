-- 資產列管：車輛與設備的取得成本、零利率分期、折舊與處分
CREATE TYPE "AssetCategory" AS ENUM ('MOTORCYCLE', 'TRUCK', 'CAR', 'EQUIPMENT', 'OTHER');

ALTER TYPE "FinanceSourceType" ADD VALUE 'LOAN_PAYMENT';

ALTER TABLE "FinanceSettings" ADD COLUMN "loanPartyId" TEXT;

CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "vehicleId" TEXT,
    "acquiredDate" TIMESTAMP(3) NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "usefulLifeYears" INTEGER NOT NULL,
    "salvageValue" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "hasLoan" BOOLEAN NOT NULL DEFAULT false,
    "downPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lender" TEXT,
    "monthlyPayment" DOUBLE PRECISION,
    "termCount" INTEGER,
    "firstPaymentDate" TIMESTAMP(3),
    "paymentDay" INTEGER,
    "settledDate" TIMESTAMP(3),
    "settleAmount" DOUBLE PRECISION,
    "disposedDate" TIMESTAMP(3),
    "disposalAmount" DOUBLE PRECISION,
    "disposalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Asset_vehicleId_key" ON "Asset"("vehicleId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
