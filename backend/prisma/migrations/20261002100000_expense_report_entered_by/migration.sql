-- AlterTable: 加油／停車費回報代填者
ALTER TABLE "FuelReport" ADD COLUMN "enteredById" TEXT;
ALTER TABLE "ParkingFeeReport" ADD COLUMN "enteredById" TEXT;

-- AddForeignKey
ALTER TABLE "FuelReport" ADD CONSTRAINT "FuelReport_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ParkingFeeReport" ADD CONSTRAINT "ParkingFeeReport_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
