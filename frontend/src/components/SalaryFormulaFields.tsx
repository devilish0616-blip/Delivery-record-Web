import type { SalaryFormulaConfig } from "../api/types";

export function hasNegativeNumber(config: SalaryFormulaConfig): boolean {
  const numbers = [
    config.attendanceThresholds.seniorMinDays,
    config.attendanceThresholds.staffMinDays,
    config.levelThreshold.highAvgThreshold,
    config.dailyRates.dailyCountBreakpoint,
    config.dailyRates.seniorStaffHigh.above,
    config.dailyRates.seniorStaffHigh.atOrBelow,
    config.dailyRates.seniorStaffLow.above,
    config.dailyRates.seniorStaffLow.atOrBelow,
    config.dailyRates.temp,
    config.incentiveBonus.tier1Days,
    config.incentiveBonus.tier1Avg,
    config.incentiveBonus.tier1Amount,
    config.incentiveBonus.tier2Days,
    config.incentiveBonus.tier2Avg,
    config.incentiveBonus.tier2Amount,
  ];
  return numbers.some((n) => Number.isNaN(n) || n < 0);
}

const numberInputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

// 職等/預設職等共用的薪資計算公式欄位（門檻/單價/激勵獎金/公式說明），
// 從 SettingsPage 抽出，供「職等薪資設定」頁的每個職等各自編輯一份公式時重用
export function SalaryFormulaFields({
  config,
  onChange,
}: {
  config: SalaryFormulaConfig;
  onChange: (next: SalaryFormulaConfig) => void;
}) {
  function updateAttendanceThreshold(key: keyof SalaryFormulaConfig["attendanceThresholds"], value: number) {
    onChange({ ...config, attendanceThresholds: { ...config.attendanceThresholds, [key]: value } });
  }
  function updateLevelThreshold(value: number) {
    onChange({ ...config, levelThreshold: { highAvgThreshold: value } });
  }
  function updateDailyRate(key: "dailyCountBreakpoint" | "temp", value: number) {
    onChange({ ...config, dailyRates: { ...config.dailyRates, [key]: value } });
  }
  function updateTieredRate(
    level: "seniorStaffHigh" | "seniorStaffLow",
    key: "above" | "atOrBelow",
    value: number
  ) {
    onChange({
      ...config,
      dailyRates: { ...config.dailyRates, [level]: { ...config.dailyRates[level], [key]: value } },
    });
  }
  function updateIncentiveBonus(key: keyof SalaryFormulaConfig["incentiveBonus"], value: number) {
    onChange({ ...config, incentiveBonus: { ...config.incentiveBonus, [key]: value } });
  }
  function updateFormulaNotes(value: string) {
    onChange({ ...config, formulaNotes: value });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-600">職稱判定門檻</h3>
        <p className="mt-1 text-xs text-gray-400">依員工當月出勤天數，自動判定當月職稱為資深員工、員工或臨時工。</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">資深員工最低出勤天數</label>
            <input
              type="number"
              min={0}
              value={config.attendanceThresholds.seniorMinDays}
              onChange={(e) => updateAttendanceThreshold("seniorMinDays", Number(e.target.value))}
              className={numberInputClass}
            />
            <p className="mt-1 text-xs text-gray-400">出勤天數 ≥ 此值 → 資深員工</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">員工最低出勤天數</label>
            <input
              type="number"
              min={0}
              value={config.attendanceThresholds.staffMinDays}
              onChange={(e) => updateAttendanceThreshold("staffMinDays", Number(e.target.value))}
              className={numberInputClass}
            />
            <p className="mt-1 text-xs text-gray-400">出勤天數 &gt; 此值 → 員工，否則 → 臨時工</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">高件數日均件數門檻</label>
            <input
              type="number"
              min={0}
              value={config.levelThreshold.highAvgThreshold}
              onChange={(e) => updateLevelThreshold(Number(e.target.value))}
              className={numberInputClass}
            />
            <p className="mt-1 text-xs text-gray-400">日均件數 &gt; 此值 → 高件數，否則 → 低件數</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-600">每件單價設定（元）</h3>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">單日件數高低門檻</label>
            <input
              type="number"
              min={0}
              value={config.dailyRates.dailyCountBreakpoint}
              onChange={(e) => updateDailyRate("dailyCountBreakpoint", Number(e.target.value))}
              className={numberInputClass}
            />
            <p className="mt-1 text-xs text-gray-400">單日件數 &gt; 此值 → 採用較高單價（僅資深員工適用）</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">臨時工單價</label>
            <input
              type="number"
              min={0}
              step="0.1"
              value={config.dailyRates.temp}
              onChange={(e) => updateDailyRate("temp", Number(e.target.value))}
              className={numberInputClass}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-700">
              資深員工／員工 - 高件數（日均件數 &gt; 高件數門檻）
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">資深員工：單日件數 &gt; 門檻</label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={config.dailyRates.seniorStaffHigh.above}
                  onChange={(e) => updateTieredRate("seniorStaffHigh", "above", Number(e.target.value))}
                  className={numberInputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">基本單價（員工一律適用）</label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={config.dailyRates.seniorStaffHigh.atOrBelow}
                  onChange={(e) => updateTieredRate("seniorStaffHigh", "atOrBelow", Number(e.target.value))}
                  className={numberInputClass}
                />
              </div>
            </div>
          </div>
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-700">
              資深員工／員工 - 低件數（日均件數 ≤ 高件數門檻）
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">資深員工：單日件數 &gt; 門檻</label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={config.dailyRates.seniorStaffLow.above}
                  onChange={(e) => updateTieredRate("seniorStaffLow", "above", Number(e.target.value))}
                  className={numberInputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">基本單價（員工一律適用）</label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={config.dailyRates.seniorStaffLow.atOrBelow}
                  onChange={(e) => updateTieredRate("seniorStaffLow", "atOrBelow", Number(e.target.value))}
                  className={numberInputClass}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-600">激勵獎金條件</h3>
        <p className="mt-1 text-xs text-gray-400">當月出勤天數與日均件數同時達標時，依最高符合的等級發放對應獎金。</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">第一級：出勤天數 ≥</label>
            <input
              type="number"
              min={0}
              value={config.incentiveBonus.tier1Days}
              onChange={(e) => updateIncentiveBonus("tier1Days", Number(e.target.value))}
              className={numberInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">第一級：日均件數 &gt;</label>
            <input
              type="number"
              min={0}
              value={config.incentiveBonus.tier1Avg}
              onChange={(e) => updateIncentiveBonus("tier1Avg", Number(e.target.value))}
              className={numberInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">第一級：獎金金額（元）</label>
            <input
              type="number"
              min={0}
              value={config.incentiveBonus.tier1Amount}
              onChange={(e) => updateIncentiveBonus("tier1Amount", Number(e.target.value))}
              className={numberInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">第二級：出勤天數 ≥</label>
            <input
              type="number"
              min={0}
              value={config.incentiveBonus.tier2Days}
              onChange={(e) => updateIncentiveBonus("tier2Days", Number(e.target.value))}
              className={numberInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">第二級：日均件數 &gt;</label>
            <input
              type="number"
              min={0}
              value={config.incentiveBonus.tier2Avg}
              onChange={(e) => updateIncentiveBonus("tier2Avg", Number(e.target.value))}
              className={numberInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">第二級：獎金金額（元）</label>
            <input
              type="number"
              min={0}
              value={config.incentiveBonus.tier2Amount}
              onChange={(e) => updateIncentiveBonus("tier2Amount", Number(e.target.value))}
              className={numberInputClass}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">公式說明（將顯示於薪資計算頁面）</label>
        <textarea
          rows={3}
          value={config.formulaNotes}
          onChange={(e) => updateFormulaNotes(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
