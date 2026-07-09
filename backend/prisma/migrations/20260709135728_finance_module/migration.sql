-- CreateEnum
CREATE TYPE "FinanceRecordType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "FinanceCategoryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceSourceType" AS ENUM ('MANUAL', 'IMPORT', 'FUEL_REPORT', 'PARKING_FEE_REPORT', 'MAINTENANCE_LOG', 'SALARY_SNAPSHOT');

-- CreateTable
CREATE TABLE "FinanceParty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isShareholder" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "kind" "FinanceCategoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceRecord" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "FinanceRecordType" NOT NULL,
    "partyId" TEXT NOT NULL,
    "counterPartyId" TEXT,
    "categoryId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "sourceType" "FinanceSourceType" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSourceLink" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "sourceType" "FinanceSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amountAtLink" DOUBLE PRECISION NOT NULL,
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "fuelPartyId" TEXT,
    "parkingPartyId" TEXT,
    "maintenancePartyId" TEXT,
    "salaryPartyId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceParty_name_key" ON "FinanceParty"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_kind_name_key" ON "FinanceCategory"("kind", "name");

-- CreateIndex
CREATE INDEX "FinanceRecord_date_idx" ON "FinanceRecord"("date");

-- CreateIndex
CREATE INDEX "FinanceRecord_type_idx" ON "FinanceRecord"("type");

-- CreateIndex
CREATE INDEX "FinanceRecord_partyId_idx" ON "FinanceRecord"("partyId");

-- CreateIndex
CREATE INDEX "FinanceRecord_categoryId_idx" ON "FinanceRecord"("categoryId");

-- CreateIndex
CREATE INDEX "FinanceSourceLink_recordId_idx" ON "FinanceSourceLink"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSourceLink_sourceType_sourceId_key" ON "FinanceSourceLink"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinanceParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_counterPartyId_fkey" FOREIGN KEY ("counterPartyId") REFERENCES "FinanceParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourceLink" ADD CONSTRAINT "FinanceSourceLink_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "FinanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
