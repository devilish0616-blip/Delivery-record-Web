import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { ReconciliationRecord } from "../../api/types";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function ReconciliationPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await apiClient.get<ReconciliationRecord[]>("/reconciliation");
      setRecords(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!file) {
      setError("請選擇要上傳的 Excel 檔案");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("year", String(year));
    formData.append("month", String(month));

    setSubmitting(true);
    try {
      const { data } = await apiClient.post<ReconciliationRecord & { warning?: string | null }>(
        "/reconciliation/upload",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setMessage(data.warning ?? "對帳完成");
      setFile(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // 系統 ≤ 貨運行（差異 ≥ 0）顯示 +數字 並標紅字；系統 > 貨運行（差異 < 0）顯示 -數字 並標綠字
  function diffCountDisplay(excelMinusSystem: number): { text: string; className: string } {
    return excelMinusSystem >= 0
      ? { text: `+${excelMinusSystem}`, className: "font-medium text-red-600" }
      : { text: `${excelMinusSystem}`, className: "font-medium text-green-600" };
  }

  function diffAmountDisplay(excelMinusSystem: number): { text: string; className: string } {
    const diff = Math.round(excelMinusSystem);
    return diff >= 0
      ? { text: `+${diff.toLocaleString()}`, className: "font-medium text-red-600" }
      : { text: diff.toLocaleString(), className: "font-medium text-green-600" };
  }

  function formatAmount(n: number): string {
    return Math.round(n).toLocaleString();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">貨運行 Excel 對帳</h1>

      {isAdmin && (
      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
      >
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
        <div className="sm:col-span-2 lg:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">月結 Excel 檔案</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">
            請上傳貨運行月結 Excel（系統會讀取檔案第一個工作表「總表」）
          </p>
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{error}</p>}
        {message && <p className="text-sm text-green-600 sm:col-span-2 lg:col-span-4">{message}</p>}
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "上傳中..." : "上傳並對帳"}
          </button>
        </div>
      </form>
      )}
      {!isAdmin && error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          件數比對
        </h2>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : records.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無對帳紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th rowSpan={2} className="border-b border-gray-200 px-4 py-2 align-bottom">
                    月份
                  </th>
                  <th colSpan={3} className="border-b border-gray-100 px-4 py-1 text-center">
                    正物流件數
                  </th>
                  <th colSpan={3} className="border-b border-gray-100 px-4 py-1 text-center">
                    逆物流件數
                  </th>
                </tr>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-2">貨運行</th>
                  <th className="border-b border-gray-200 px-4 py-2">系統</th>
                  <th className="border-b border-gray-200 px-4 py-2">差異</th>
                  <th className="border-b border-gray-200 px-4 py-2">貨運行</th>
                  <th className="border-b border-gray-200 px-4 py-2">系統</th>
                  <th className="border-b border-gray-200 px-4 py-2">差異</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const forward = diffCountDisplay(r.forwardCountDifference);
                  const reverse = diffCountDisplay(r.reverseCountDifference);
                  return (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">
                        {r.year} / {r.month}
                      </td>
                      <td className="px-4 py-2">{r.excelForwardCount}</td>
                      <td className="px-4 py-2">{r.systemForwardCount}</td>
                      <td className={`px-4 py-2 ${forward.className}`}>{forward.text}</td>
                      <td className="px-4 py-2">{r.excelReverseCount}</td>
                      <td className="px-4 py-2">{r.systemReverseCount}</td>
                      <td className={`px-4 py-2 ${reverse.className}`}>{reverse.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          金額比對（未稅）
        </h2>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : records.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無對帳紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">月份</th>
                  <th className="px-4 py-2">貨運行運費收入</th>
                  <th className="px-4 py-2">系統計算收入</th>
                  <th className="px-4 py-2">差異</th>
                  <th className="px-4 py-2">檔案</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const revenue = diffAmountDisplay(r.revenueDifference);
                  return (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">
                        {r.year} / {r.month}
                      </td>
                      <td className="px-4 py-2">{formatAmount(r.excelRevenueBeforeTax)}</td>
                      <td className="px-4 py-2">{formatAmount(r.systemRevenueBeforeTax)}</td>
                      <td className={`px-4 py-2 ${revenue.className}`}>{revenue.text}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{r.sourceFileName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
