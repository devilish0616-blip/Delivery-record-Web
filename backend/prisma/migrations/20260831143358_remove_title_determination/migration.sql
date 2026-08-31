-- 移除「職稱判定」（依出勤天數/日均件數自動分資深員工/員工/臨時工 × 高/低）與管理者手動覆蓋機制。
-- 薪資計算改為每件單價 = 固定原始單價 + 出勤/日均件數/總件數疊加加給（見 PayGrade.config 的 pieceRate 欄位）。
-- 歷史覆蓋紀錄綁在已移除的「職稱類別」概念上，沒有可遷移的意義，直接砍表。

-- DropForeignKey
ALTER TABLE "EmployeeTitleOverride" DROP CONSTRAINT IF EXISTS "EmployeeTitleOverride_userId_fkey";

-- DropTable
DROP TABLE "EmployeeTitleOverride";

-- DropEnum
DROP TYPE "TitleCategory";

-- DropEnum
DROP TYPE "TitleLevel";

-- 資料回填：既有 PayGrade.config 仍是舊形狀（attendanceThresholds/levelThreshold/dailyRates），
-- 新版計算邏輯讀取 config.pieceRate，若不先回填，/salary 會直接 500。
-- basePrice 沿用舊制「員工低件數基本單價」延續性，三階出勤／日均／總件數門檻與加給採系統預設值，
-- 管理者之後可於「職等薪資設定」頁依實際需求逐一調整每個職等的數值。
UPDATE "PayGrade"
SET config = (config - 'attendanceThresholds' - 'levelThreshold' - 'dailyRates')
  || jsonb_build_object(
    'pieceRate',
    jsonb_build_object(
      'basePrice', COALESCE(
        (config -> 'dailyRates' -> 'seniorStaffLow' ->> 'atOrBelow')::numeric,
        (config -> 'dailyRates' ->> 'temp')::numeric,
        23
      ),
      'attendanceBonus', jsonb_build_object(
        'tier1Days', 15, 'tier1Bonus', 1,
        'tier2Days', 20, 'tier2Bonus', 0.5,
        'tier3Days', 25, 'tier3Bonus', 0.5
      ),
      'averageCountBonus', jsonb_build_object('threshold', 60, 'bonus', 1),
      'totalCountBonus', jsonb_build_object('threshold', 2000, 'bonus', 1)
    )
  )
WHERE NOT (config ? 'pieceRate');

-- 舊版系統預設的公式說明文字仍提到「職稱判定」，僅替換完全等於該段預設文字的紀錄（管理者自行編寫的說明不動）
UPDATE "PayGrade"
SET config = jsonb_set(
  config,
  '{formulaNotes}',
  to_jsonb(
    '薪資 = 總件數 × 每件單價 + 司機/隨車加給 + 職務加給 + 激勵獎金 - 扣款。' ||
    '每件單價 = 固定原始單價，並依當月出勤天數（達門檻逐階疊加）、日均件數（達門檻加給）、' ||
    '當月總件數（達門檻加給）三項條件疊加加給，整月固定套用同一單價。'
  )
)
WHERE config ->> 'formulaNotes' =
  '薪資 = 總件數 × 每件單價 + 司機/隨車加給 + 職務加給 + 激勵獎金 - 扣款。' ||
  '職稱依當月出勤天數自動判定（資深員工 / 員工 / 臨時工），' ||
  '資深員工與員工再依日平均件數判定為高件數或低件數，' ||
  '每件單價依職稱與高低件數決定；僅資深員工於單日件數超過門檻時全數改採較高單價。';
