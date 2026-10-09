-- 油資／停車費計入哪個月的薪資（payMonth）、薪資加項、員工確認薪資單

-- 1. payMonth：已核准的回報先照回報日期的月份
ALTER TABLE "FuelReport" ADD COLUMN "payMonth" TIMESTAMP(3);
ALTER TABLE "ParkingFeeReport" ADD COLUMN "payMonth" TIMESTAMP(3);
CREATE INDEX "FuelReport_payMonth_idx" ON "FuelReport"("payMonth");
CREATE INDEX "ParkingFeeReport_payMonth_idx" ON "ParkingFeeReport"("payMonth");

UPDATE "FuelReport" SET "payMonth" = date_trunc('month', "date") WHERE "status" = 'APPROVED';
UPDATE "ParkingFeeReport" SET "payMonth" = date_trunc('month', "date") WHERE "status" = 'APPROVED';

-- 2. 以前「該月封存之後才核准」的回報沒有算進封存的薪資，也沒有算進任何一個月（員工沒領到）：
--    改算進核准那個月（台灣時間）起、第一個還沒封存的月份
UPDATE "FuelReport" f SET "payMonth" = (
  SELECT m FROM generate_series(
    date_trunc('month', f."reviewedAt" + interval '8 hours'),
    date_trunc('month', f."reviewedAt" + interval '8 hours') + interval '36 months',
    interval '1 month'
  ) AS m
  WHERE NOT EXISTS (
    SELECT 1 FROM "SalaryMonthLock" l
    WHERE l."year" = EXTRACT(YEAR FROM m)::int AND l."month" = EXTRACT(MONTH FROM m)::int
  )
  ORDER BY m LIMIT 1
)
WHERE f."status" = 'APPROVED' AND f."reviewedAt" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "SalaryMonthLock" l
  WHERE l."year" = EXTRACT(YEAR FROM f."date")::int AND l."month" = EXTRACT(MONTH FROM f."date")::int
    AND f."reviewedAt" > l."lockedAt"
);

UPDATE "ParkingFeeReport" f SET "payMonth" = (
  SELECT m FROM generate_series(
    date_trunc('month', f."reviewedAt" + interval '8 hours'),
    date_trunc('month', f."reviewedAt" + interval '8 hours') + interval '36 months',
    interval '1 month'
  ) AS m
  WHERE NOT EXISTS (
    SELECT 1 FROM "SalaryMonthLock" l
    WHERE l."year" = EXTRACT(YEAR FROM m)::int AND l."month" = EXTRACT(MONTH FROM m)::int
  )
  ORDER BY m LIMIT 1
)
WHERE f."status" = 'APPROVED' AND f."reviewedAt" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "SalaryMonthLock" l
  WHERE l."year" = EXTRACT(YEAR FROM f."date")::int AND l."month" = EXTRACT(MONTH FROM f."date")::int
    AND f."reviewedAt" > l."lockedAt"
);

-- 3. 薪資加項
CREATE TABLE "SalaryAddition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalaryAddition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalaryAddition_userId_year_month_idx" ON "SalaryAddition"("userId", "year", "month");
ALTER TABLE "SalaryAddition" ADD CONSTRAINT "SalaryAddition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. 員工確認薪資單
CREATE TYPE "SalaryAckStatus" AS ENUM ('CONFIRMED', 'QUESTION');
CREATE TABLE "SalaryAck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "SalaryAckStatus" NOT NULL,
    "note" TEXT,
    "lockedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalaryAck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalaryAck_userId_year_month_key" ON "SalaryAck"("userId", "year", "month");
CREATE INDEX "SalaryAck_year_month_idx" ON "SalaryAck"("year", "month");
ALTER TABLE "SalaryAck" ADD CONSTRAINT "SalaryAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
