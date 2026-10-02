-- CreateTable: 資料檢查被標記「沒問題」的異常
CREATE TABLE "AnomalyDismissal" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dismissedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnomalyDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnomalyDismissal_key_key" ON "AnomalyDismissal"("key");

-- AddForeignKey
ALTER TABLE "AnomalyDismissal" ADD CONSTRAINT "AnomalyDismissal_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
