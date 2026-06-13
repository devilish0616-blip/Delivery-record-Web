import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { MonthlyPricing, SalarySettings } from "../../api/types";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function SettingsPage() {
  const [salarySettings, setSalarySettings] = useState<SalarySettings | null>(null);
  const [driverBonus, setDriverBonus] = useState(0);
  const [attendantBonus, setAttendantBonus] = useState(0);
  const [savingSalary, setSavingSalary] = useState(false);
  const [salaryMessage, setSalaryMessage] = useState<string | null>(null);
  const [salaryError, setSalaryError] = useState<string | null>(null);

  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [forwardPrice, setForwardPrice] = useState(0);
  const [reversePrice, setReversePrice] = useState(0);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingMessage, setPricingMessage] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingList, setPricingList] = useState<MonthlyPricing[]>([]);

  useEffect(() => {
    apiClient.get<SalarySettings>("/settings/salary").then(({ data }) => {
      setSalarySettings(data);
      setDriverBonus(data.driverBonus);
      setAttendantBonus(data.attendantBonus);
    });
    loadPricingList();
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
      });
      setSalarySettings(data);
      setSalaryMessage("已儲存");
    } catch (err) {
      setSalaryError(getErrorMessage(err));
    } finally {
      setSavingSalary(false);
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
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">系統設定</h1>

      <form
        onSubmit={handleSalarySubmit}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-3"
      >
        <h2 className="text-sm font-medium text-gray-700 sm:col-span-3">薪資加給設定</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">司機日加給</label>
          <input
            type="number"
            value={driverBonus}
            onChange={(e) => setDriverBonus(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">隨車人員日加給</label>
          <input
            type="number"
            value={attendantBonus}
            onChange={(e) => setAttendantBonus(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={savingSalary || !salarySettings}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {savingSalary ? "儲存中..." : "儲存"}
          </button>
        </div>
        {salaryError && <p className="text-sm text-red-600 sm:col-span-3">{salaryError}</p>}
        {salaryMessage && <p className="text-sm text-green-600 sm:col-span-3">{salaryMessage}</p>}
      </form>

      <form
        onSubmit={handlePricingSubmit}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <h2 className="text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-4">
          每月收入單價設定
        </h2>
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
            onChange={(e) => setForwardPrice(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">稅後：{(forwardPrice * 0.96).toFixed(2)}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">逆物流稅前單價</label>
          <input
            type="number"
            step="0.01"
            value={reversePrice}
            onChange={(e) => setReversePrice(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">稅後：{(reversePrice * 0.96).toFixed(2)}</p>
        </div>
        {pricingError && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{pricingError}</p>}
        {pricingMessage && (
          <p className="text-sm text-green-600 sm:col-span-2 lg:col-span-4">{pricingMessage}</p>
        )}
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={savingPricing}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {savingPricing ? "儲存中..." : "儲存此月單價"}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          歷史單價設定
        </h2>
        {pricingList.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無設定紀錄</p>
        ) : (
          <div className="overflow-x-auto">
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
      </div>
    </div>
  );
}
