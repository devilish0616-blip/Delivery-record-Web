-- AlterTable: 薪資設定新增封存寬限日（次月第 N 日後提醒尚未封存上月）
ALTER TABLE "SalarySettings" ADD COLUMN "salaryLockGraceDay" INTEGER NOT NULL DEFAULT 5;

-- CreateTable: 薪資月份封存鎖（存在即代表該年月已封存）
CREATE TABLE "SalaryMonthLock" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedById" TEXT,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryMonthLock_pkey" PRIMARY KEY ("year","month")
);

-- CreateTable: 薪資快照（封存當下每位員工的完整薪資計算結果）
CREATE TABLE "SalarySnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalarySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalarySnapshot_userId_year_month_key" ON "SalarySnapshot"("userId","year","month");

-- CreateIndex
CREATE INDEX "SalarySnapshot_year_month_idx" ON "SalarySnapshot"("year","month");
