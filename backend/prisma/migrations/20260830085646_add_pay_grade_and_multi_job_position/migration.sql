-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extraCapabilities" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "payGradeId" TEXT;

-- CreateTable
CREATE TABLE "UserJobPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobPositionId" TEXT NOT NULL,
    "since" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserJobPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayGrade" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PayGrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserJobPosition_jobPositionId_idx" ON "UserJobPosition"("jobPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserJobPosition_userId_jobPositionId_key" ON "UserJobPosition"("userId", "jobPositionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_payGradeId_fkey" FOREIGN KEY ("payGradeId") REFERENCES "PayGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobPosition" ADD CONSTRAINT "UserJobPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobPosition" ADD CONSTRAINT "UserJobPosition_jobPositionId_fkey" FOREIGN KEY ("jobPositionId") REFERENCES "JobPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 保底：確保 PayGrade 資料表永遠恰好一筆 isDefault = true（部分唯一索引，Prisma schema 無法表達，故手寫）
CREATE UNIQUE INDEX "PayGrade_one_default_idx" ON "PayGrade" ("isDefault") WHERE "isDefault" = true;

-- Backfill：建立「預設職等」，沿用既有 SalaryFormulaSettings 設定；若尚未設定過公式則採用系統原本寫死的預設值。
-- 所有既有員工的 payGradeId 保持 NULL，應用層會將 NULL 解讀為「套用預設職等」，因此既有薪資試算結果不受影響。
INSERT INTO "PayGrade" (id, name, config, "isActive", "isDefault", "sortOrder", "updatedAt")
SELECT
  'default-pay-grade',
  '預設職等',
  COALESCE(
    (SELECT config FROM "SalaryFormulaSettings" WHERE id = 1),
    '{
      "attendanceThresholds": { "seniorMinDays": 20, "staffMinDays": 10 },
      "levelThreshold": { "highAvgThreshold": 60 },
      "dailyRates": {
        "dailyCountBreakpoint": 100,
        "seniorStaffHigh": { "above": 28, "atOrBelow": 25 },
        "seniorStaffLow": { "above": 26, "atOrBelow": 23 },
        "temp": 23,
        "special": 30
      },
      "incentiveBonus": {
        "tier1Days": 25, "tier1Avg": 60, "tier1Amount": 3000,
        "tier2Days": 25, "tier2Avg": 30, "tier2Amount": 1500
      },
      "formulaNotes": "薪資 = 總件數 × 每件單價 + 司機/隨車加給 + 職務加給 + 激勵獎金 - 扣款。職稱依當月出勤天數自動判定（資深員工 / 員工 / 臨時工），資深員工與員工再依日平均件數判定為高件數或低件數，每件單價依職稱與高低件數決定；僅資深員工於單日件數超過門檻時全數改採較高單價。"
    }'::jsonb
  ),
  true,
  true,
  0,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "PayGrade" WHERE "isDefault" = true);

-- Backfill：既有單一職務指派（User.jobPositionId/jobPositionSince）各轉一筆寫入多選 join table，since 日期原樣保留
INSERT INTO "UserJobPosition" (id, "userId", "jobPositionId", since, "createdAt", "updatedAt")
SELECT
  substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 25),
  "id",
  "jobPositionId",
  "jobPositionSince",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "jobPositionId" IS NOT NULL;
