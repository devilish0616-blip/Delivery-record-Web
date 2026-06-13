-- AlterEnum: 「今日角色」選項更名（司機 → 貨車司機、隨車人員 → 貨車隨車人員）
-- RENAME VALUE 為 metadata-only 操作，既有 DailyRoleRecord 資料會自動對應到新名稱，無需資料搬移
ALTER TYPE "DailyRoleType" RENAME VALUE 'DRIVER' TO 'TRUCK_DRIVER';
ALTER TYPE "DailyRoleType" RENAME VALUE 'ATTENDANT' TO 'TRUCK_ATTENDANT';
