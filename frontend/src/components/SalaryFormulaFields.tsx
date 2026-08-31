import type { SalaryFormulaConfig } from "../api/types";

export function hasNegativeNumber(config: SalaryFormulaConfig): boolean {
  const numbers = [
    config.pieceRate.basePrice,
    config.pieceRate.attendanceBonus.tier1Days,
    config.pieceRate.attendanceBonus.tier1Bonus,
    config.pieceRate.attendanceBonus.tier2Days,
    config.pieceRate.attendanceBonus.tier2Bonus,
    config.pieceRate.attendanceBonus.tier3Days,
    config.pieceRate.attendanceBonus.tier3Bonus,
    config.pieceRate.averageCountBonus.threshold,
    config.pieceRate.averageCountBonus.bonus,
    config.pieceRate.totalCountBonus.threshold,
    config.pieceRate.totalCountBonus.bonus,
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
  function updateBasePrice(value: number) {
    onChange({ ...config, pieceRate: { ...config.pieceRate, basePrice: value } });
  }
  function updateAttendanceBonus(
    key: keyof SalaryFormulaConfig["pieceRate"]["attendanceBonus"],
    value: number
  ) {
    onChange({
      ...config,
      pieceRate: {
        ...config.pieceRate,
        attendanceBonus: { ...config.pieceRate.attendanceBonus, [key]: value },
      },
    });
  }
  function updateAverageCountBonus(key: "threshold" | "bonus", value: number) {
    onChange({
      ...config,
      pieceRate: {
        ...config.pieceRate,
        averageCountBonus: { ...config.pieceRate.averageCountBonus, [key]: value },
      },
    });
  }
  function updateTotalCountBonus(key: "threshold" | "bonus", value: number) {
    onChange({
      ...config,
      pieceRate: {
        ...config.pieceRate,
        totalCountBonus: { ...config.pieceRate.totalCountBonus, [key]: value },
      },
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
        <h3 className="text-sm font-semibold text-gray-600">每件單價</h3>
        <p className="mt-1 text-xs text-gray-400">
          單價 = 固定原始單價 + 出勤天數加給（達門檻逐階疊加）+ 日均件數加給 + 當月總件數加給，整月固定套用同一單價。
        </p>
        <div className="mt-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">固定原始單價（元）</label>
          <input
            type="number"
            min={0}
            step="0.1"
            value={config.pieceRate.basePrice}
            onChange={(e) => updateBasePrice(Number(e.target.value))}
            className={`max-w-xs ${numberInputClass}`}
          />
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700">出勤天數加給（三階疊加，達第二、三階時前面的加給仍計入）</p>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            {(["tier1", "tier2", "tier3"] as const).map((tier, i) => (
              <div key={tier} className="rounded-md border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-600">第 {i + 1} 階</p>
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">出勤天數 ≥</label>
                    <input
                      type="number"
                      min={0}
                      value={config.pieceRate.attendanceBonus[`${tier}Days`]}
                      onChange={(e) => updateAttendanceBonus(`${tier}Days`, Number(e.target.value))}
                      className={numberInputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">加給（元）</label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={config.pieceRate.attendanceBonus[`${tier}Bonus`]}
                      onChange={(e) => updateAttendanceBonus(`${tier}Bonus`, Number(e.target.value))}
                      className={numberInputClass}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-700">日均件數加給（嚴格大於門檻）</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">日均件數 &gt;</label>
                <input
                  type="number"
                  min={0}
                  value={config.pieceRate.averageCountBonus.threshold}
                  onChange={(e) => updateAverageCountBonus("threshold", Number(e.target.value))}
                  className={numberInputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">加給（元）</label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={config.pieceRate.averageCountBonus.bonus}
                  onChange={(e) => updateAverageCountBonus("bonus", Number(e.target.value))}
                  className={numberInputClass}
                />
              </div>
            </div>
          </div>
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-700">當月總件數加給（達門檻含等於）</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">總件數 ≥</label>
                <input
                  type="number"
                  min={0}
                  value={config.pieceRate.totalCountBonus.threshold}
                  onChange={(e) => updateTotalCountBonus("threshold", Number(e.target.value))}
                  className={numberInputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">加給（元）</label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={config.pieceRate.totalCountBonus.bonus}
                  onChange={(e) => updateTotalCountBonus("bonus", Number(e.target.value))}
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
