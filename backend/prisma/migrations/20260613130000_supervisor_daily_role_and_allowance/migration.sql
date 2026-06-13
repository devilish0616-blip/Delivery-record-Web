-- CreateEnum
CREATE TYPE "DailyRoleType" AS ENUM ('NONE', 'DRIVER', 'ATTENDANT');

-- AlterTable: User - 新增固定每月職務加給
ALTER TABLE "User" ADD COLUMN     "monthlyAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex: MileageRecord - 同一人同一天同一車輛僅一筆紀錄（覆蓋機制）
CREATE UNIQUE INDEX "MileageRecord_userId_date_vehicleId_key" ON "MileageRecord"("userId", "date", "vehicleId");

-- CreateTable
CREATE TABLE "DailyRoleRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "role" "DailyRoleType" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRoleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyRoleRecord_userId_date_key" ON "DailyRoleRecord"("userId", "date");

-- AddForeignKey
ALTER TABLE "DailyRoleRecord" ADD CONSTRAINT "DailyRoleRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropTable: 改由 DailyRoleRecord + MileageRecord 統計派遣狀況，不再需要手動派遣紀錄
DROP TABLE "DispatchRecord";
