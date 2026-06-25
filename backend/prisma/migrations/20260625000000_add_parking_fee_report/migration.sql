-- CreateEnum: 停車費回報審核狀態
CREATE TYPE "ParkingFeeReportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable: 停車費回報
CREATE TABLE "ParkingFeeReport" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "status" "ParkingFeeReportStatus" NOT NULL DEFAULT 'PENDING',
    "employeeId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingFeeReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParkingFeeReport_employeeId_idx" ON "ParkingFeeReport"("employeeId");

-- CreateIndex
CREATE INDEX "ParkingFeeReport_date_idx" ON "ParkingFeeReport"("date");

-- CreateIndex
CREATE INDEX "ParkingFeeReport_status_idx" ON "ParkingFeeReport"("status");

-- CreateIndex
CREATE INDEX "ParkingFeeReport_vehicleId_idx" ON "ParkingFeeReport"("vehicleId");

-- AddForeignKey
ALTER TABLE "ParkingFeeReport" ADD CONSTRAINT "ParkingFeeReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingFeeReport" ADD CONSTRAINT "ParkingFeeReport_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingFeeReport" ADD CONSTRAINT "ParkingFeeReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
