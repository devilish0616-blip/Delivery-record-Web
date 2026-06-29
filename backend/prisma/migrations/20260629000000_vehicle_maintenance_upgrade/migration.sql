-- CreateEnum: 車輛故障報修處理狀態
CREATE TYPE "RepairRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- AlterTable: 車輛新增證件／稅務到期日
ALTER TABLE "Vehicle" ADD COLUMN "insuranceCompulsoryExpiry" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "insuranceLiabilityExpiry" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "inspectionExpiry" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "licenseTaxDueDate" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "fuelTaxDueDate" TIMESTAMP(3);

-- AlterTable: 保養項目新增時間週期
ALTER TABLE "VehicleMaintenanceItem" ADD COLUMN "intervalDays" INTEGER;

-- CreateTable: 維修保養履歷
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mileage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itemName" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceLog_vehicleId_idx" ON "MaintenanceLog"("vehicleId");

-- CreateIndex
CREATE INDEX "MaintenanceLog_date_idx" ON "MaintenanceLog"("date");

-- CreateTable: 車輛故障報修
CREATE TABLE "RepairRequest" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RepairRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reportedById" TEXT NOT NULL,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "resolveNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairRequest_vehicleId_idx" ON "RepairRequest"("vehicleId");

-- CreateIndex
CREATE INDEX "RepairRequest_status_idx" ON "RepairRequest"("status");

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
