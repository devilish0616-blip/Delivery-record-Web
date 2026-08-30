import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { MonthlyPricing, SalarySettings } from "../../api/types";
import { APP_VERSION, BUILD_DATE } from "../../version";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
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

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    registration: true,
    salaryBonus: true,
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

      {/* 薪資計算公式已改為「職等」各自設定，請至「職等薪資設定」頁管理（每個職等各自一份公式，可自由新增職等） */}
      {isAdmin && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
          薪資計算公式（門檻／單價／激勵獎金）已改由「職等」各自設定，不再是全公司共用一份。
          <Link to="/admin/pay-grades" className="ml-1 text-blue-600 hover:underline">
            前往「職等薪資設定」頁管理 →
          </Link>
        </div>
      )}

      {/* 員工職務加給與權限管理已整併至「員工管理」頁（員工資料／職務加給設定分頁） */}

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
