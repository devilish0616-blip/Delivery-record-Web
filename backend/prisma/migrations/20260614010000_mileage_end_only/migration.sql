-- AlterTable: 車輛里程記錄改為僅記錄「當日結束里程」，行駛里程由應用層比對前一筆紀錄計算
ALTER TABLE "MileageRecord" DROP COLUMN "startMileage";
