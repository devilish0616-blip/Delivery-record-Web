-- Add vehicleId to FuelReport to track which motorcycle the fuel was for

ALTER TABLE "FuelReport" ADD COLUMN "vehicleId" TEXT;

ALTER TABLE "FuelReport" ADD CONSTRAINT "FuelReport_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FuelReport_vehicleId_idx" ON "FuelReport"("vehicleId");
