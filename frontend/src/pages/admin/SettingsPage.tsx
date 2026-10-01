import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { MonthlyPricing, SalarySettings } from "../../api/types";
import { APP_VERSION, BUILD_DATE } from "../../version";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500";

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function toYearMonth(p: { year: number; month: number }): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function Card({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-gray-400">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="space-y-4">
      {!embedded && <h1 className="text-xl font-semibold text-gray-800">系統設定</h1>}
      <PricingCard isAdmin={isAdmin} />
      <SalaryCard isAdmin={isAdmin} />
      <RegistrationCard isAdmin={isAdmin} />
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-400">
        <span className="font-medium text-gray-500">系統版本</span> v{APP_VERSION} ／ 建置日期 {BUILD_DATE}
      </div>
    </div>
  );
}

// ── 每月收入單價：上方表單新增／修改，下方同一張表列出所有月份，點「修改」帶回表單 ──
function PricingCard({ isAdmin }: { isAdmin: boolean }) {
  const [list, setList] = useState<MonthlyPricing[]>([]);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [forwardPrice, setForwardPrice] = useState("");
  const [reversePrice, setReversePrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await apiClient.get<MonthlyPricing[]>("/settings/pricing");
      setList(data);
      return data;
    } catch (err) {
      setError(getErrorMessage(err));
      return [];
    }
  }

  // 切換月份時把該月已設定的值帶進表單；尚未設定則清空
  function selectMonth(ym: string, source: MonthlyPricing[] = list) {
    setYearMonth(ym);
    setMessage(null);
    setError(null);
    const existing = source.find((p) => toYearMonth(p) === ym);
    setForwardPrice(existing ? String(existing.forwardPrice) : "");
    setReversePrice(existing ? String(existing.reversePrice) : "");
  }

  useEffect(() => {
    load().then((data) => selectMonth(currentYearMonth(), data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const existing = list.find((p) => toYearMonth(p) === yearMonth);
  const currentSet = list.some((p) => toYearMonth(p) === currentYearMonth());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const [year, month] = yearMonth.split("-").map(Number);
    if (!year || !month) return setError("請選擇月份");
    if (forwardPrice === "" || reversePrice === "") return setError("請輸入正物流與逆物流實拿單價");
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.post("/settings/pricing", {
        year,
        month,
        forwardPrice: Number(forwardPrice),
        reversePrice: Number(reversePrice),
      });
      setMessage(`已儲存 ${year} 年 ${month} 月單價`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: MonthlyPricing) {
    if (!window.confirm(`確定刪除 ${p.year} 年 ${p.month} 月的單價？刪除後該月預估營收會顯示為未設定。`)) return;
    setError(null);
    setMessage(null);
    try {
      await apiClient.delete(`/settings/pricing/${p.year}/${p.month}`);
      const data = await load();
      if (toYearMonth(p) === yearMonth) selectMonth(yearMonth, data);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <Card
      title="每月收入單價"
      description="直接輸入貨運行每件實際付給公司的金額（正／逆物流各一），用於營運總覽與帳務月報的預估營收。"
    >
      {!currentSet && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          本月（{currentYearMonth().replace("-", " 年 ")} 月）尚未設定單價，預估營收會顯示為未設定。
        </p>
      )}

      {isAdmin && (
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label className="mb-1 block text-xs text-gray-500">月份</label>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => selectMonth(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">正物流實拿（元／件）</label>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={forwardPrice}
              onChange={(e) => setForwardPrice(e.target.value)}
              placeholder="例：28.8"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">逆物流實拿（元／件）</label>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={reversePrice}
              onChange={(e) => setReversePrice(e.target.value)}
              placeholder="例：28.8"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="h-[38px] rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "儲存中..." : existing ? "更新" : "新增"}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}

      <div className={isAdmin ? "mt-4" : ""}>
        {list.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">尚無設定紀錄</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">月份</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">正物流</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">逆物流</th>
                  {isAdmin && <th className="px-3 py-2 text-right font-medium">操作</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((p, i) => {
                  const prev = list[i + 1];
                  const ym = toYearMonth(p);
                  const selected = isAdmin && ym === yearMonth;
                  return (
                    <tr key={p.id} className={`border-t border-gray-100 ${selected ? "bg-blue-50" : ""}`}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {p.year} 年 {p.month} 月
                        {ym === currentYearMonth() && (
                          <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-700">本月</span>
                        )}
                      </td>
                      <PriceCell value={p.forwardPrice} prev={prev?.forwardPrice} />
                      <PriceCell value={p.reversePrice} prev={prev?.reversePrice} />
                      {isAdmin && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => selectMonth(ym)}
                            className="rounded px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
                          >
                            修改
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                          >
                            刪除
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

// 單價格子：顯示金額，與前一筆（上一個有設定的月份）不同時標示漲跌
function PriceCell({ value, prev }: { value: number; prev?: number }) {
  const diff = prev === undefined ? 0 : Math.round((value - prev) * 100) / 100;
  return (
    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
      {value}
      {diff !== 0 && (
        <span className={`ml-1.5 text-[11px] ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
          {diff > 0 ? "▲" : "▼"}
          {Math.abs(diff)}
        </span>
      )}
    </td>
  );
}

// ── 薪資：只剩封存提醒日；件數單價、司機／隨車日加給、激勵獎金都在職等薪資設定 ──
function SalaryCard({ isAdmin }: { isAdmin: boolean }) {
  const [graceDay, setGraceDay] = useState(5);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<SalarySettings>("/settings/salary").then(({ data }) => {
      setGraceDay(data.salaryLockGraceDay ?? 5);
      setLoaded(true);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.put("/settings/salary", { salaryLockGraceDay: graceDay });
      setMessage("已儲存");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="薪資"
      description={
        <>
          件數單價、司機／隨車日加給、激勵獎金依職等各自設定，
          <Link to="/admin/salary?tab=grades" className="text-blue-600 hover:underline">
            前往「薪資 → 職等設定」→
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className="mb-1 block text-xs text-gray-500">薪資封存提醒日（次月第幾日）</label>
          <input
            type="number"
            min={1}
            max={28}
            value={graceDay}
            disabled={!isAdmin}
            onChange={(e) => setGraceDay(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        {isAdmin && (
          <button
            type="submit"
            disabled={saving || !loaded}
            className="h-[38px] rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
        )}
      </form>
      <p className="mt-2 text-xs text-gray-400">過了這一天若上月薪資仍未封存，首頁「我的待辦」會提醒（不會自動封存）。</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
    </Card>
  );
}

// ── 員工註冊開關 ──
function RegistrationCard({ isAdmin }: { isAdmin: boolean }) {
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<SalarySettings>("/settings/salary").then(({ data }) => setEnabled(data.registrationEnabled));
  }, []);

  async function toggle() {
    setError(null);
    setSaving(true);
    try {
      const { data } = await apiClient.put<SalarySettings>("/settings/registration", { registrationEnabled: !enabled });
      setEnabled(data.registrationEnabled);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="員工註冊">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-700">開放新員工自行於登入頁註冊帳號</p>
          <p className="mt-1 text-xs text-gray-400">關閉後註冊頁將拒絕新帳號，只能由管理者於「員工」頁建立。</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="開放員工自行註冊"
          disabled={saving || !isAdmin}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            enabled ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-600">目前狀態：{enabled ? "開放註冊" : "已關閉註冊"}</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
