import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import type { AssetDuesResponse, FinanceParty } from "../../api/types";
import { YearMonthPicker } from "../YearMonthPicker";
import { money } from "./assetLabels";

// 本月應繳：列出該月到期的分期，勾選後一次帶入記帳（每期一筆「車貸」支出，同一期只能帶入一次）
export function AssetDuesPanel({ isAdmin }: { isAdmin: boolean }) {
  // 網址可帶 ?year=&month=（月底結算清單「去帶入」）
  const [searchParams] = useSearchParams();
  const [{ year, month }, setYm] = useState(() => {
    const now = new Date();
    const y = Number(searchParams.get("year"));
    const m = Number(searchParams.get("month"));
    return y && m >= 1 && m <= 12 ? { year: y, month: m } : { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [skipBusy, setSkipBusy] = useState<string | null>(null);
  const [data, setData] = useState<AssetDuesResponse | null>(null);
  const [parties, setParties] = useState<FinanceParty[]>([]);
  const [partyId, setPartyId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const { data } = await apiClient.get<AssetDuesResponse>("/assets/dues", { params: { year, month } });
      setData(data);
      setPicked(new Set(data.items.filter((i) => !i.recordId && !i.ignored).map((i) => i.sourceId)));
      setPartyId((p) => p || data.defaultPartyId || "");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    setMessage(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => {
    if (!isAdmin) return;
    apiClient
      .get<FinanceParty[]>("/finance/parties")
      .then(({ data }) => setParties(data.filter((p) => p.isActive)))
      .catch(() => {});
  }, [isAdmin]);

  async function handleImport() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { data: r } = await apiClient.post<{ created: number }>("/assets/dues/import", {
        year,
        month,
        partyId: partyId || undefined,
        sourceIds: Array.from(picked),
      });
      setMessage(`已帶入 ${r.created} 筆車貸到記帳`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // 已在記帳頁自己記過的期數：標記「已另外記帳」就不會再提醒帶入（可還原）
  async function toggleSkip(sourceId: string, skip: boolean) {
    setSkipBusy(sourceId);
    setError(null);
    setMessage(null);
    try {
      if (skip) {
        await apiClient.post("/finance/import-center/ignore", { sourceType: "LOAN_PAYMENT", sourceId, reason: "已另外記帳" });
      } else {
        await apiClient.delete(`/finance/import-center/ignore/LOAN_PAYMENT/${encodeURIComponent(sourceId)}`);
      }
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSkipBusy(null);
    }
  }

  const items = data?.items ?? [];
  const pending = items.filter((i) => !i.recordId && !i.ignored);
  const pickedTotal = items.filter((i) => picked.has(i.sourceId)).reduce((s, i) => s + i.amount, 0);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          已繳期數依繳款日自動計算；這裡的「帶入記帳」只是把繳款記進帳本（分類「車貸」），不影響分期進度。已經在記帳頁自己記過的期數，按「已另外記帳」就不會重複帶入，也不再提醒。
        </p>
        <YearMonthPicker year={year} month={month} onChange={(y, m) => setYm({ year: y, month: m })} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && (
        <p className="text-sm text-green-700">
          {message}，
          <Link to={`/admin/finance?year=${year}&month=${month}`} className="underline">
            到記帳頁查看
          </Link>
        </p>
      )}

      {!data ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          {year} 年 {month} 月沒有到期的分期
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <ul className="divide-y divide-gray-100">
            {items.map((i) => (
              <li key={i.sourceId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {isAdmin && !i.recordId && !i.ignored && (
                  <input
                    type="checkbox"
                    checked={picked.has(i.sourceId)}
                    onChange={() => toggle(i.sourceId)}
                    aria-label={`帶入 ${i.assetName} 第 ${i.installmentNo} 期`}
                    className="h-4 w-4"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {i.dueDate.slice(5).replace("-", "/")}・{i.assetName}・
                    <span className="font-mono">{money(i.amount)}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {i.lender ? `${i.lender}・` : ""}第 {i.installmentNo} / {i.termCount} 期
                    {i.isLast && "（最後一期，繳完自動結清）"}
                  </p>
                </div>
                {i.recordId ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">已帶入記帳</span>
                ) : i.ignored ? (
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">已另外記帳</span>
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={skipBusy === i.sourceId}
                        onClick={() => toggleSkip(i.sourceId, false)}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        還原
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">未帶入</span>
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={skipBusy === i.sourceId}
                        onClick={() => toggleSkip(i.sourceId, true)}
                        title="這期已經在記帳頁自己記過了，不要再帶入，也不再提醒"
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                      >
                        已另外記帳
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {isAdmin && pending.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3">
              <label htmlFor="dues-party" className="text-xs text-gray-500">
                付款人
              </label>
              <select
                id="dues-party"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">請選擇</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="text-sm text-gray-600">
                已選 {picked.size} 筆・<span className="font-mono font-semibold">{money(pickedTotal)}</span>
              </span>
              <button
                type="button"
                disabled={busy || picked.size === 0 || !partyId}
                onClick={handleImport}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "帶入中..." : "帶入記帳"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
