-- CreateEnum: 車輛花費分類
CREATE TYPE "ExpenseCategory" AS ENUM ('MAINTENANCE', 'INSURANCE', 'OTHER');

-- AlterTable: 維修履歷新增花費分類（既有資料預設為保養／維修）
ALTER TABLE "MaintenanceLog" ADD COLUMN "category" "ExpenseCategory" NOT NULL DEFAULT 'MAINTENANCE';

-- CreateIndex: 依分類彙整車輛花費
CREATE INDEX "MaintenanceLog_category_idx" ON "MaintenanceLog"("category");
