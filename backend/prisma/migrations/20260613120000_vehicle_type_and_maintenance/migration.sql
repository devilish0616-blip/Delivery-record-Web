-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'TRUCK');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "type" "VehicleType" NOT NULL DEFAULT 'TRUCK',
ADD COLUMN     "currentMileage" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- DataMigration: 將目前累計里程回填為既有里程紀錄中最大的結束里程
UPDATE "Vehicle" v
SET "currentMileage" = COALESCE((
  SELECT MAX(m."endMileage") FROM "MileageRecord" m WHERE m."vehicleId" = v."id"
), 0);

-- CreateTable
CREATE TABLE "VehicleMaintenanceItem" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "intervalKm" DOUBLE PRECISION NOT NULL,
    "lastChangeMileage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastChangeNote" TEXT,
    "lastChangeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleMaintenanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleMaintenanceItem_vehicleId_idx" ON "VehicleMaintenanceItem"("vehicleId");

-- AddForeignKey
ALTER TABLE "VehicleMaintenanceItem" ADD CONSTRAINT "VehicleMaintenanceItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: 將既有 lastOilChangeMileage 轉換為「機油」保養項目（週期 1000 km）
INSERT INTO "VehicleMaintenanceItem" ("id", "vehicleId", "itemName", "intervalKm", "lastChangeMileage", "createdAt", "updatedAt")
SELECT concat('init_oil_', "id"), "id", '機油', 1000, "lastOilChangeMileage", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Vehicle";

-- AlterTable
ALTER TABLE "Vehicle" DROP COLUMN "lastOilChangeMileage";
