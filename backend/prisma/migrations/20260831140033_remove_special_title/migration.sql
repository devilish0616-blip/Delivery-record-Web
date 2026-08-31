-- 移除「特殊職稱」（執行長/特殊固定單價）功能：改用「職等」（PayGrade）差異化定價。
-- AlterTable
ALTER TABLE "User" DROP COLUMN "specialTitle";

-- DropEnum
DROP TYPE "SpecialTitle";
