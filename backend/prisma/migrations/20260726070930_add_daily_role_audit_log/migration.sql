-- CreateTable
CREATE TABLE "DailyRoleAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "previousRole" "DailyRoleType" NOT NULL,
    "newRole" "DailyRoleType" NOT NULL,
    "changedById" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRoleAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyRoleAuditLog_userId_date_idx" ON "DailyRoleAuditLog"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyRoleAuditLog_createdAt_idx" ON "DailyRoleAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "DailyRoleAuditLog" ADD CONSTRAINT "DailyRoleAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRoleAuditLog" ADD CONSTRAINT "DailyRoleAuditLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
