-- 資料備份時間、固定收支範本

ALTER TABLE "SalarySettings" ADD COLUMN "lastBackupAt" TIMESTAMP(3);
ALTER TABLE "SalarySettings" ADD COLUMN "lastBackupById" TEXT;

CREATE TABLE "FinanceRecurring" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceRecordType" NOT NULL,
    "partyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceRecurring_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "FinanceRecurring" ADD CONSTRAINT "FinanceRecurring_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinanceParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceRecurring" ADD CONSTRAINT "FinanceRecurring_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FinanceRecurringRun" (
    "id" TEXT NOT NULL,
    "recurringId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "recordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceRecurringRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinanceRecurringRun_recordId_key" ON "FinanceRecurringRun"("recordId");
CREATE UNIQUE INDEX "FinanceRecurringRun_recurringId_year_month_key" ON "FinanceRecurringRun"("recurringId", "year", "month");
ALTER TABLE "FinanceRecurringRun" ADD CONSTRAINT "FinanceRecurringRun_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "FinanceRecurring"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceRecurringRun" ADD CONSTRAINT "FinanceRecurringRun_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "FinanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
