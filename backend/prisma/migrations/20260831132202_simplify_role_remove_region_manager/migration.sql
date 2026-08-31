-- 角色簡化為三層（董事長／執行長／員工）：移除 REGION_MANAGER。
-- 「區域主管」身份不再靠 role 表示，改以 RegionMember.isManager 為唯一來源（程式端同步調整）。
-- 先把既有 REGION_MANAGER 使用者 backfill 成 EMPLOYEE，其 RegionMember.isManager 紀錄不受影響，
-- 區域主管的審核／查看範圍會在應用程式層改用 isManager 判斷，不會因此次遷移而消失。
UPDATE "User" SET "role" = 'EMPLOYEE' WHERE "role" = 'REGION_MANAGER';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';
COMMIT;
