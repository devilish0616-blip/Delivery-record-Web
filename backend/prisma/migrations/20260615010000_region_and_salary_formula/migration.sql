-- CreateTable: 區域主管系統 - 區域
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable: 區域主管系統 - 區域成員
CREATE TABLE "RegionMember" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegionMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegionMember_regionId_userId_key" ON "RegionMember"("regionId", "userId");

-- CreateIndex
CREATE INDEX "RegionMember_userId_idx" ON "RegionMember"("userId");

-- AddForeignKey
ALTER TABLE "RegionMember" ADD CONSTRAINT "RegionMember_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionMember" ADD CONSTRAINT "RegionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: 薪資計算公式設定 (singleton, id 固定為 1)
CREATE TABLE "SalaryFormulaSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SalaryFormulaSettings_pkey" PRIMARY KEY ("id")
);
