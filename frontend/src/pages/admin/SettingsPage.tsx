import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type {
  MonthlyPricing,
  Role,
  SalaryFormulaConfig,
  SalaryFormulaSettings,
  SalarySettings,
  SpecialTitle,
  User,
} from "../../api/types";
import { APP_VERSION, BUILD_DATE } from "../../version";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function hasNegativeNumber(config: SalaryFormulaConfig): boolean {
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
    config.dailyRates.special,
    config.incentiveBonus.tier1Days,
    config.incentiveBonus.tier1Avg,
    config.incentiveBonus.tier1Amount,
    config.incentiveBonus.tier2Days,
    config.incentiveBonus.tier2Avg,
    config.incentiveBonus.tier2Amount,
  ];
  return numbers.some((n) => Number.isNaN(n) || n < 0);
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [salarySettings, setSalarySettings] = useState<SalarySettings | null>(null);
  const [driverBonus, setDriverBonus] = useState(0);
  const [attendantBonus, setAttendantBonus] = useState(0);
  const [graceDay, setGraceDay] = useState(5);
  const [savingSalary, setSavingSalary] = useState(false);
  const [salaryMessage, setSalaryMessage] = useState<string | null>(null);
  const [salaryError, setSalaryError] = useState<string | null>(null);

  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [savingRegistration, setSavingRegistration] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [forwardPrice, setForwardPrice] = useState(0);
  const [reversePrice, setReversePrice] = useState(0);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingMessage, setPricingMessage] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingList, setPricingList] = useState<MonthlyPricing[]>([]);

  const [users, setUsers] = useState<User[]>([]);
  const [allowanceValues, setAllowanceValues] = useState<Record<string, number>>({});
  const [allowanceSaving, setAllowanceSaving] = useState<string | null>(null);
  const [allowanceMessage, setAllowanceMessage] = useState<string | null>(null);
  const [allowanceError, setAllowanceError] = useState<string | null>(null);

  const [permError, setPermError] = useState<string | null>(null);

  const [formulaSettings, setFormulaSettings] = useState<SalaryFormulaSettings | null>(null);
  const [formulaConfig, setFormulaConfig] = useState<SalaryFormulaConfig | null>(null);
  const [savingFormula, setSavingFormula] = useState(false);
  const [formulaMessage, setFormulaMessage] = useState<string | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    registration: true,
    salaryBonus: true,
    formula: false,
    allowance: true,
    permissions: false,
    pricing: true,
    pricingHistory: false,
  });

  function toggle(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    apiClient.get<SalarySettings>("/settings/salary").then(({ data }) => {
      setSalarySettings(data);
      setDriverBonus(data.driverBonus);
      setAttendantBonus(data.attendantBonus);
      setGraceDay(data.salaryLockGraceDay ?? 5);
      setRegistrationEnabled(data.registrationEnabled);
    });
    loadPricingList();
    loadUsers();
    if (isAdmin) {
      apiClient.get<SalaryFormulaSettings>("/settings/salary-formula").then(({ data }) => {
        setFormulaSettings(data);
        setFormulaConfig(data.config);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPricingMessage(null);
    setPricingError(null);
    apiClient
      .get<MonthlyPricing>("/settings/pricing", { params: { year, month } })
      .then(({ data }) => {
        setForwardPrice(data.forwardPriceBeforeTax);
        setReversePrice(data.reversePriceBeforeTax);
      })
      .catch(() => {
        setForwardPrice(0);
        setReversePrice(0);
      });
  }, [year, month]);

  async function loadPricingList() {
    try {
      const { data } = await apiClient.get<MonthlyPricing[]>("/settings/pricing");
      setPricingList(data);
    } catch (err) {
      setPricingError(getErrorMessage(err));
    }
  }

  async function loadUsers() {
    try {
      const { data } = await apiClient.get<User[]>("/employees");
      setUsers(data);
      const values: Record<string, number> = {};
      for (const u of data) {
        values[u.id] = u.monthlyAllowance ?? 0;
      }
      setAllowanceValues(values);
    } catch (err) {
      setAllowanceError(getErrorMessage(err));
    }
  }

  async function handleRoleChange(id: string, role: Role) {
    setPermError(null);
    try {
      await apiClient.patch(`/employees/${id}/role`, { role });
      await loadUsers();
    } catch (err) {
      setPermError(getErrorMessage(err));
    }
  }

  async function handleSpecialTitleChange(id: string, specialTitle: SpecialTitle | "") {
    setPermError(null);
    try {
      await apiClient.patch(`/employees/${id}/special-title`, {
        specialTitle: specialTitle === "" ? null : specialTitle,
      });
      await loadUsers();
    } catch (err) {
      setPermError(getErrorMessage(err));
    }
  }

  async function handleStatusToggle(id: string, isActive: boolean) {
    setPermError(null);
    try {
      await apiClient.patch(`/employees/${id}/status`, { isActive });
      await loadUsers();
    } catch (err) {
      setPermError(getErrorMessage(err));
    }
  }

  async function handleAllowanceSave(id: string) {
    setAllowanceError(null);
    setAllowanceMessage(null);
    setAllowanceSaving(id);
    try {
      await apiClient.patch(`/employees/${id}/allowance`, {
        monthlyAllowance: allowanceValues[id] ?? 0,
      });
      setAllowanceMessage("已儲存");
    } catch (err) {
      setAllowanceError(getErrorMessage(err));
    } finally {
      setAllowanceSaving(null);
    }
  }

  async function handleSalarySubmit(e: FormEvent) {
    e.preventDefault();
    setSalaryError(null);
    setSalaryMessage(null);
    setSavingSalary(true);
    try {
      const { data } = await apiClient.put<SalarySettings>("/settings/salary", {
        driverBonus,
        attendantBonus,
        salaryLockGraceDay: graceDay,
      });
      setSalarySettings(data);
      setSalaryMessage("已儲存");
    } catch (err) {
      setSalaryError(getErrorMessage(err));
    } finally {
      setSavingSalary(false);
    }
  }

  async function handleRegistrationToggle(enabled: boolean) {
    setRegistrationError(null);
    setSavingRegistration(true);
    try {
      const { data } = await apiClient.put<SalarySettings>("/settings/registration", {
        registrationEnabled: enabled,
      });
      setRegistrationEnabled(data.registrationEnabled);
    } catch (err) {
      setRegistrationError(getErrorMessage(err));
    } finally {
      setSavingRegistration(false);
    }
  }

  async function handlePricingSubmit(e: FormEvent) {
    e.preventDefault();
    setPricingError(null);
    setPricingMessage(null);
    setSavingPricing(true);
    try {
      await apiClient.post("/settings/pricing", {
        year,
        month,
        forwardPriceBeforeTax: forwardPrice,
        reversePriceBeforeTax: reversePrice,
      });
      setPricingMessage("已儲存");
      await loadPricingList();
    } catch (err) {
      setPricingError(getErrorMessage(err));
    } finally {
      setSavingPricing(false);
    }
  }

  function updateAttendanceThreshold(
    key: keyof SalaryFormulaConfig["attendanceThresholds"],
    value: number
  ) {
    setFormulaConfig((prev) =>
      prev ? { ...prev, attendanceThresholds: { ...prev.attendanceThresholds, [key]: value } } : prev
    );
  }

  function updateLevelThreshold(value: number) {
    setFormulaConfig((prev) => (prev ? { ...prev, levelThreshold: { highAvgThreshold: value } } : prev));
  }

  function updateDailyRate(key: "dailyCountBreakpoint" | "temp" | "special", value: number) {
    setFormulaConfig((prev) =>
      prev ? { ...prev, dailyRates: { ...prev.dailyRates, [key]: value } } : prev
    );
  }

  function updateTieredRate(
    level: "seniorStaffHigh" | "seniorStaffLow",
    key: "above" | "atOrBelow",
    value: number
  ) {
    setFormulaConfig((prev) =>
      prev
        ? {
            ...prev,
            dailyRates: { ...prev.dailyRates, [level]: { ...prev.dailyRates[level], [key]: value } },
          }
        : prev
    );
  }

  function updateIncentiveBonus(key: keyof SalaryFormulaConfig["incentiveBonus"], value: number) {
    setFormulaConfig((prev) =>
      prev ? { ...prev, incentiveBonus: { ...prev.incentiveBonus, [key]: value } } : prev
    );
  }

  function updateFormulaNotes(value: string) {
    setFormulaConfig((prev) => (prev ? { ...prev, formulaNotes: value } : prev));
  }

  async function handleFormulaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formulaConfig) return;
    setFormulaError(null);
    setFormulaMessage(null);
    if (hasNegativeNumber(formulaConfig)) {
      setFormulaError("所有數值欄位皆不得為負數或空白");
      return;
    }
    setSavingFormula(true);
    try {
      const { data } = await apiClient.put<SalaryFormulaSettings>("/settings/salary-formula", formulaConfig);
      setFormulaSettings(data);
      setFormulaConfig(data.config);
      setFormulaMessage("已儲存");
    } catch (err) {
      setFormulaError(getErrorMessage(err));
    } finally {
      setSavingFormula(false);
    }
  }

  const formulaUpdatedByName = formulaSettings?.updatedBy
    ? users.find((u) => u.id === formulaSettings.updatedBy)?.name ?? formulaSettings.updatedBy
    : null;

  const numberInputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-800">系統設定</h1>

      {/* ── 員工註冊 ── */}
      <Section title="員工註冊" open={openSections.registration} onToggle={() => toggle("registration")}>
        <div className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-700">開放新員工自行於登入頁註冊帳號</p>
              <p className="mt-1 text-xs text-gray-400">
                關閉後，「/register」註冊頁將拒絕新帳號註冊，僅能由管理者於後台建立員工帳號。
              </p>
            </div>
            <button
              type="button"
              disabled={savingRegistration || !isAdmin}
              onClick={() => handleRegistrationToggle(!registrationEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                registrationEnabled ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  registrationEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          <p className="mt-2 text-sm font-medium text-gray-600">
            目前狀態：{registrationEnabled ? "開放註冊" : "已關閉註冊"}
          </p>
          {registrationError && <p className="mt-2 text-sm text-red-600">{registrationError}</p>}
        </div>
      </Section>

      {/* ── 薪資加給設定 ── */}
      <Section
        title="薪資加給設定"
        open={openSections.salaryBonus}
        onToggle={() => toggle("salaryBonus")}
      >
        <form onSubmit={handleSalarySubmit} className="grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">司機日加給</label>
            <input
              type="number"
              value={driverBonus}
              disabled={!isAdmin}
              onChange={(e) => setDriverBonus(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">隨車人員日加給</label>
            <input
              type="number"
              value={attendantBonus}
              disabled={!isAdmin}
              onChange={(e) => setAttendantBonus(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">薪資封存提醒日</label>
            <input
              type="number"
              min={1}
              max={28}
              value={graceDay}
              disabled={!isAdmin}
              onChange={(e) => setGraceDay(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              次月第 N 日後若上月薪資仍未封存，儀表板會提醒（不會自動封存）。
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-end">
              <button
                type="submit"
                disabled={savingSalary || !salarySettings}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingSalary ? "儲存中..." : "儲存"}
              </button>
            </div>
          )}
          {salaryError && <p className="text-sm text-red-600 sm:col-span-3">{salaryError}</p>}
          {salaryMessage && <p className="text-sm text-green-600 sm:col-span-3">{salaryMessage}</p>}
        </form>
      </Section>

      {/* ── 薪資計算公式（僅董事長） ── */}
      {isAdmin && (
        <Section title="薪資計算公式" open={openSections.formula} onToggle={() => toggle("formula")}>
          <div className="p-4">
            {formulaSettings?.updatedAt && (
              <p className="mb-3 text-xs text-gray-400">
                上次修改時間：{formatDateTime(formulaSettings.updatedAt)}
                {formulaUpdatedByName ? ` ｜ 修改者：${formulaUpdatedByName}` : ""}
              </p>
            )}
            {!formulaConfig ? (
              <p className="text-sm text-gray-500">載入中...</p>
            ) : (
              <form onSubmit={handleFormulaSubmit} className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-600">職稱判定門檻</h3>
                  <p className="mt-1 text-xs text-gray-400">
                    依員工當月出勤天數，自動判定當月職稱為資深員工、員工或臨時工。
                  </p>
                  <div className="mt-2 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        資深員工最低出勤天數
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.attendanceThresholds.seniorMinDays}
                        onChange={(e) =>
                          updateAttendanceThreshold("seniorMinDays", Number(e.target.value))
                        }
                        className={numberInputClass}
                      />
                      <p className="mt-1 text-xs text-gray-400">出勤天數 ≥ 此值 → 資深員工</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        員工最低出勤天數
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.attendanceThresholds.staffMinDays}
                        onChange={(e) =>
                          updateAttendanceThreshold("staffMinDays", Number(e.target.value))
                        }
                        className={numberInputClass}
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        出勤天數 &gt; 此值 → 員工，否則 → 臨時工
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        高件數日均件數門檻
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.levelThreshold.highAvgThreshold}
                        onChange={(e) => updateLevelThreshold(Number(e.target.value))}
                        className={numberInputClass}
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        日均件數 &gt; 此值 → 高件數，否則 → 低件數
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-600">每件單價設定（元）</h3>
                  <div className="mt-2 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        單日件數高低門檻
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.dailyRates.dailyCountBreakpoint}
                        onChange={(e) =>
                          updateDailyRate("dailyCountBreakpoint", Number(e.target.value))
                        }
                        className={numberInputClass}
                      />
                      <p className="mt-1 text-xs text-gray-400">單日件數 &gt; 此值 → 採用較高單價</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">臨時工單價</label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={formulaConfig.dailyRates.temp}
                        onChange={(e) => updateDailyRate("temp", Number(e.target.value))}
                        className={numberInputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        執行長／特殊職稱單價
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={formulaConfig.dailyRates.special}
                        onChange={(e) => updateDailyRate("special", Number(e.target.value))}
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
                          <label className="mb-1 block text-xs text-gray-500">
                            單日件數 &gt; 高低門檻
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={formulaConfig.dailyRates.seniorStaffHigh.above}
                            onChange={(e) =>
                              updateTieredRate("seniorStaffHigh", "above", Number(e.target.value))
                            }
                            className={numberInputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">
                            單日件數 ≤ 高低門檻
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={formulaConfig.dailyRates.seniorStaffHigh.atOrBelow}
                            onChange={(e) =>
                              updateTieredRate("seniorStaffHigh", "atOrBelow", Number(e.target.value))
                            }
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
                          <label className="mb-1 block text-xs text-gray-500">
                            單日件數 &gt; 高低門檻
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={formulaConfig.dailyRates.seniorStaffLow.above}
                            onChange={(e) =>
                              updateTieredRate("seniorStaffLow", "above", Number(e.target.value))
                            }
                            className={numberInputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">
                            單日件數 ≤ 高低門檻
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={formulaConfig.dailyRates.seniorStaffLow.atOrBelow}
                            onChange={(e) =>
                              updateTieredRate("seniorStaffLow", "atOrBelow", Number(e.target.value))
                            }
                            className={numberInputClass}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-600">激勵獎金條件</h3>
                  <p className="mt-1 text-xs text-gray-400">
                    當月出勤天數與日均件數同時達標時，依最高符合的等級發放對應獎金。
                  </p>
                  <div className="mt-2 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        第一級：出勤天數 ≥
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.incentiveBonus.tier1Days}
                        onChange={(e) => updateIncentiveBonus("tier1Days", Number(e.target.value))}
                        className={numberInputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        第一級：日均件數 &gt;
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.incentiveBonus.tier1Avg}
                        onChange={(e) => updateIncentiveBonus("tier1Avg", Number(e.target.value))}
                        className={numberInputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        第一級：獎金金額（元）
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.incentiveBonus.tier1Amount}
                        onChange={(e) => updateIncentiveBonus("tier1Amount", Number(e.target.value))}
                        className={numberInputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        第二級：出勤天數 ≥
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.incentiveBonus.tier2Days}
                        onChange={(e) => updateIncentiveBonus("tier2Days", Number(e.target.value))}
                        className={numberInputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        第二級：日均件數 &gt;
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.incentiveBonus.tier2Avg}
                        onChange={(e) => updateIncentiveBonus("tier2Avg", Number(e.target.value))}
                        className={numberInputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        第二級：獎金金額（元）
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formulaConfig.incentiveBonus.tier2Amount}
                        onChange={(e) => updateIncentiveBonus("tier2Amount", Number(e.target.value))}
                        className={numberInputClass}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    公式說明（將顯示於薪資計算頁面）
                  </label>
                  <textarea
                    rows={3}
                    value={formulaConfig.formulaNotes}
                    onChange={(e) => updateFormulaNotes(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {formulaError && <p className="text-sm text-red-600">{formulaError}</p>}
                {formulaMessage && <p className="text-sm text-green-600">{formulaMessage}</p>}

                <div>
                  <button
                    type="submit"
                    disabled={savingFormula}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingFormula ? "儲存中..." : "儲存"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Section>
      )}

      {/* ── 職務加給設定 ── */}
      <Section title="職務加給設定" open={openSections.allowance} onToggle={() => toggle("allowance")}>
        <p className="px-4 pt-3 text-xs text-gray-400">
          設定每位員工固定的每月職務加給，將自動計入薪資計算與薪資單。
        </p>
        {allowanceError && <p className="px-4 pt-2 text-sm text-red-600">{allowanceError}</p>}
        {allowanceMessage && <p className="px-4 pt-2 text-sm text-green-600">{allowanceMessage}</p>}
        {users.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無員工資料</p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">姓名</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">每月職務加給</th>
                  {isAdmin && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{u.name}</td>
                    <td className="px-4 py-2 text-gray-500">{u.email}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        value={allowanceValues[u.id] ?? 0}
                        disabled={!isAdmin}
                        onChange={(e) =>
                          setAllowanceValues((prev) => ({
                            ...prev,
                            [u.id]: Number(e.target.value),
                          }))
                        }
                        className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          disabled={allowanceSaving === u.id}
                          onClick={() => handleAllowanceSave(u.id)}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {allowanceSaving === u.id ? "儲存中..." : "儲存"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── 員工權限管理 ── */}
      <Section
        title="員工權限管理"
        open={openSections.permissions}
        onToggle={() => toggle("permissions")}
      >
        <p className="px-4 pt-3 text-xs text-gray-400">
          設定每位員工的系統角色、特殊職稱與帳號啟用狀態。
        </p>
        {permError && <p className="px-4 pt-2 text-sm text-red-600">{permError}</p>}
        {users.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無員工資料</p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">姓名</th>
                  <th className="px-4 py-2">角色</th>
                  <th className="px-4 py-2">特殊職稱</th>
                  <th className="px-4 py-2">帳號狀態</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{u.name}</td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="EMPLOYEE">員工</option>
                          <option value="REGION_MANAGER">區經理</option>
                          <option value="MANAGER">執行長</option>
                          <option value="ADMIN">董事長</option>
                        </select>
                      ) : (
                        <span className="text-gray-600">
                          {
                            {
                              ADMIN: "董事長",
                              MANAGER: "執行長",
                              REGION_MANAGER: "區經理",
                              EMPLOYEE: "員工",
                            }[u.role]
                          }
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <select
                          value={u.specialTitle ?? ""}
                          onChange={(e) =>
                            handleSpecialTitleChange(u.id, e.target.value as SpecialTitle | "")
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="">無（自動判定）</option>
                          <option value="CEO">執行長</option>
                          <option value="SPECIAL">特殊</option>
                        </select>
                      ) : (
                        <span className="text-gray-600">
                          {u.specialTitle === "CEO"
                            ? "執行長"
                            : u.specialTitle === "SPECIAL"
                              ? "特殊"
                              : "無"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(u.id, !u.isActive)}
                          className={`rounded px-2 py-1 text-xs ${
                            u.isActive
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {u.isActive ? "啟用中" : "已停用"}
                        </button>
                      ) : (
                        <span
                          className={`rounded px-2 py-1 text-xs ${
                            u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {u.isActive ? "啟用中" : "已停用"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── 每月收入單價設定 ── */}
      <Section
        title="每月收入單價設定"
        open={openSections.pricing}
        onToggle={() => toggle("pricing")}
      >
        <form onSubmit={handlePricingSubmit} className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">年</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYearMonth((s) => ({ ...s, year: Number(e.target.value) }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">月</label>
            <select
              value={month}
              onChange={(e) => setYearMonth((s) => ({ ...s, month: Number(e.target.value) }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m} 月
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">正物流稅前單價</label>
            <input
              type="number"
              step="0.01"
              value={forwardPrice}
              disabled={!isAdmin}
              onChange={(e) => setForwardPrice(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">稅後：{(forwardPrice * 0.96).toFixed(2)}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">逆物流稅前單價</label>
            <input
              type="number"
              step="0.01"
              value={reversePrice}
              disabled={!isAdmin}
              onChange={(e) => setReversePrice(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">稅後：{(reversePrice * 0.96).toFixed(2)}</p>
          </div>
          {pricingError && (
            <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{pricingError}</p>
          )}
          {pricingMessage && (
            <p className="text-sm text-green-600 sm:col-span-2 lg:col-span-4">{pricingMessage}</p>
          )}
          {isAdmin && (
            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={savingPricing}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingPricing ? "儲存中..." : "儲存此月單價"}
              </button>
            </div>
          )}
        </form>
      </Section>

      {/* ── 歷史單價設定 ── */}
      <Section
        title="歷史單價設定"
        open={openSections.pricingHistory}
        onToggle={() => toggle("pricingHistory")}
      >
        {pricingList.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無設定紀錄</p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">月份</th>
                  <th className="px-4 py-2">正物流（稅前/稅後）</th>
                  <th className="px-4 py-2">逆物流（稅前/稅後）</th>
                </tr>
              </thead>
              <tbody>
                {pricingList.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      {p.year} / {p.month}
                    </td>
                    <td className="px-4 py-2">
                      {p.forwardPriceBeforeTax} / {p.forwardPriceAfterTax}
                    </td>
                    <td className="px-4 py-2">
                      {p.reversePriceBeforeTax} / {p.reversePriceAfterTax}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── 版本資訊 ── */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-400">
        <span className="font-medium text-gray-500">系統版本</span>　v{APP_VERSION}　／　建置日期{" "}
        {BUILD_DATE}
      </div>
    </div>
  );
}
