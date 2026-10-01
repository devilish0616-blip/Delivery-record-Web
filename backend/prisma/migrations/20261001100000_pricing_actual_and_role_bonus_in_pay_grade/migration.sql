-- 每月收入單價改為直接輸入正／逆物流「實拿」單價，不再由稅前 × 0.96 換算。
-- 既有資料換算成原本系統實際使用的實拿值（稅前 × 0.96），報表與儀表板金額不變。
ALTER TABLE "MonthlyPricing" RENAME COLUMN "forwardPriceBeforeTax" TO "forwardPrice";
ALTER TABLE "MonthlyPricing" RENAME COLUMN "reversePriceBeforeTax" TO "reversePrice";
UPDATE "MonthlyPricing"
SET "forwardPrice" = ROUND(("forwardPrice" * 0.96)::numeric, 4),
    "reversePrice" = ROUND(("reversePrice" * 0.96)::numeric, 4);

-- 司機／隨車日加給改由各職等自行設定（PayGrade.config.roleBonus），
-- 以原本全公司共用的設定值帶入每個職等，薪資計算結果不變。
UPDATE "PayGrade"
SET "config" = jsonb_set(
  "config",
  '{roleBonus}',
  jsonb_build_object(
    'driverDaily', COALESCE((SELECT "driverBonus" FROM "SalarySettings" WHERE "id" = 1), 1000),
    'attendantDaily', COALESCE((SELECT "attendantBonus" FROM "SalarySettings" WHERE "id" = 1), 500)
  )
);

ALTER TABLE "SalarySettings" DROP COLUMN "driverBonus";
ALTER TABLE "SalarySettings" DROP COLUMN "attendantBonus";
