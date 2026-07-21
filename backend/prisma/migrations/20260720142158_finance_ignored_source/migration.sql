-- CreateTable
CREATE TABLE "FinanceIgnoredSource" (
    "id" TEXT NOT NULL,
    "sourceType" "FinanceSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reason" TEXT,
    "ignoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceIgnoredSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceIgnoredSource_sourceType_sourceId_key" ON "FinanceIgnoredSource"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "FinanceIgnoredSource" ADD CONSTRAINT "FinanceIgnoredSource_ignoredById_fkey" FOREIGN KEY ("ignoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
