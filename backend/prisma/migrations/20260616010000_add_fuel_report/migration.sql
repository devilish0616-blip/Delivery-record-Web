-- CreateEnum: 加油回報審核狀態
CREATE TYPE "FuelReportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable: 加油回報
CREATE TABLE "FuelReport" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "status" "FuelReportStatus" NOT NULL DEFAULT 'PENDING',
    "employeeId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FuelReport_employeeId_idx" ON "FuelReport"("employeeId");

-- CreateIndex
CREATE INDEX "FuelReport_date_idx" ON "FuelReport"("date");

-- CreateIndex
CREATE INDEX "FuelReport_status_idx" ON "FuelReport"("status");

-- AddForeignKey
ALTER TABLE "FuelReport" ADD CONSTRAINT "FuelReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelReport" ADD CONSTRAINT "FuelReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
