-- 假別、一次請多天（groupId）、帳號「不用填送件」

CREATE TYPE "LeaveType" AS ENUM ('DAY_OFF', 'PERSONAL', 'SICK', 'ANNUAL', 'OTHER');
ALTER TABLE "LeaveRequest" ADD COLUMN "type" "LeaveType" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "LeaveRequest" ADD COLUMN "groupId" TEXT;
CREATE INDEX "LeaveRequest_groupId_idx" ON "LeaveRequest"("groupId");

ALTER TABLE "User" ADD COLUMN "noDeliveryRequired" BOOLEAN NOT NULL DEFAULT false;

-- 董事長帳號最近 60 天都沒有送件紀錄的，預設為「不用填送件」（之後可在員工頁改）
UPDATE "User" u SET "noDeliveryRequired" = true
WHERE u."role" = 'ADMIN' AND NOT EXISTS (
  SELECT 1 FROM "DeliveryRecord" d WHERE d."userId" = u."id" AND d."date" >= (CURRENT_DATE - INTERVAL '60 days')
);
