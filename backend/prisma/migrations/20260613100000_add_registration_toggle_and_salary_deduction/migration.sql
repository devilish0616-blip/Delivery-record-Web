-- AlterTable
ALTER TABLE "SalarySettings" ADD COLUMN     "registrationEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SalaryDeduction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryDeduction_userId_year_month_idx" ON "SalaryDeduction"("userId", "year", "month");

-- AddForeignKey
ALTER TABLE "SalaryDeduction" ADD CONSTRAINT "SalaryDeduction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
