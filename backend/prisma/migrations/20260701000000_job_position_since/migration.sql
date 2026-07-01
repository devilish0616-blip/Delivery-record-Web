-- AlterTable: 員工任職（職務）起始日
-- 職務加給自此日所屬月份起生效，之前月份不計入加給（避免回算歷史薪資）
ALTER TABLE "User" ADD COLUMN "jobPositionSince" TIMESTAMP(3);
