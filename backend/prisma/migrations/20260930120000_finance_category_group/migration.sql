-- CreateEnum
CREATE TYPE "FinanceCategoryGroup" AS ENUM ('REVENUE', 'OTHER_INCOME', 'DIRECT_COST', 'OPERATING_EXPENSE', 'OTHER_EXPENSE');

-- AlterTable
ALTER TABLE "FinanceCategory" ADD COLUMN "group" "FinanceCategoryGroup";

-- 預設歸屬（可於帳務設定調整）
UPDATE "FinanceCategory" SET "group" = 'REVENUE' WHERE "kind" = 'INCOME' AND "name" = '物流盈餘';
UPDATE "FinanceCategory" SET "group" = 'OTHER_INCOME' WHERE "kind" = 'INCOME' AND "group" IS NULL;
UPDATE "FinanceCategory" SET "group" = 'DIRECT_COST' WHERE "kind" = 'EXPENSE' AND "name" IN ('固定薪酬', '績效獎金', '油資', '維修', '停車費');
UPDATE "FinanceCategory" SET "group" = 'OTHER_EXPENSE' WHERE "kind" = 'EXPENSE' AND "name" = '押金(保證金)';
UPDATE "FinanceCategory" SET "group" = 'OPERATING_EXPENSE' WHERE "kind" = 'EXPENSE' AND "group" IS NULL;
