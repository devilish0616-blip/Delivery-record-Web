import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DashboardData, DailyRoleType } from "../../api/types";

const dailyRoleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// 純字串運算移位日期（避免時區換算誤差），date 格式固定 YYYY-MM-DD
function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${weekday}）`;
}

// 營運總覽「送件與派車」分頁上半：當天誰還沒填送件；日期由外層 DayPanel 控制，與下方派車共用
export function DeliveryStatusSection({ date, setDate }: { date: string; setDate: (update: (d: string) => string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get<DashboardData>("/dashboard", { params: { date } })
      .then(({ data }) => {
        if (active) setData(data);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date]);

  const employees = data?.dailyStatus?.employees ?? [];
  const missing = employees.filter((e) => !e.hasRecord);
  const filled = employees.filter((e) => e.hasRecord);
  const totalForward = filled.reduce((sum, e) => sum + e.forwardCount, 0);
  const totalReverse = filled.reduce((sum, e) => sum + e.reverseCount, 0);
  const progressPct = employees.length > 0 ? Math.round((filled.length / employees.length) * 100) : 0;

  const visibleMissing = useMemo(
    () => missing.filter((e) => (!search.trim() || e.name.includes(search.trim()))),
    [missing, search]
  );
  const visibleFilled = useMemo(
    () => (onlyMissing ? [] : filled.filter((e) => !search.trim() || e.name.includes(search.trim()))),
    [filled, search, onlyMissing]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">送件回報</h2>
          <p className="mt-0.5 text-xs text-gray-400">誰還沒回報一眼看到，已填寫的人再看件數明細</p>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-gray-300 bg-white p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
            aria-label="前一天"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[92px] px-1 text-center font-mono text-sm font-bold">{formatDateLabel(date)}</span>
          <button
            type="button"
            onClick={() => setDate((d) => shiftDate(d, 1))}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
            aria-label="後一天"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDate(() => todayDateString())}
            className="ml-1 rounded border-l border-gray-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-gray-100"
          >
            今天
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">載入中...</p>}

      {!loading && data?.dailyStatus && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
              <p className="text-[11px] font-semibold text-gray-400">回報進度</p>
              <p className="mt-1 font-mono text-xl font-bold text-gray-800">
                {filled.length} / {employees.length} 人
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-green-600" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
              <p className="text-[11px] font-semibold text-gray-400">尚未填寫</p>
              <p className={`mt-1 font-mono text-xl font-bold ${missing.length > 0 ? "text-red-600" : "text-gray-800"}`}>
                {missing.length} 人
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
              <p className="text-[11px] font-semibold text-gray-400">今日正物流</p>
              <p className="mt-1 font-mono text-xl font-bold text-gray-800">{totalForward} 件</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
              <p className="text-[11px] font-semibold text-gray-400">今日逆物流</p>
              <p className="mt-1 font-mono text-xl font-bold text-gray-800">{totalReverse} 件</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] max-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋姓名"
                className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyMissing((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                onlyMissing ? "border-red-200 bg-red-50 text-red-600" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              只看尚未填寫
            </button>
          </div>

          {visibleMissing.length > 0 && (
            <div className="space-y-1.5">
              <p className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                尚未填寫（{visibleMissing.length}）
              </p>
              {visibleMissing.map((e) => (
                <EmployeeRow key={e.userId} employee={e} date={date} />
              ))}
            </div>
          )}

          {visibleFilled.length > 0 && (
            <div className="space-y-1.5">
              <p className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                已填寫（{visibleFilled.length}）
              </p>
              {visibleFilled.map((e) => (
                <EmployeeRow key={e.userId} employee={e} date={date} />
              ))}
            </div>
          )}

          {visibleMissing.length === 0 && visibleFilled.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">沒有符合條件的人員</p>
          )}
        </>
      )}
    </div>
  );
}

function EmployeeRow({
  employee,
  date,
}: {
  date: string;
  employee: {
    userId: string;
    name: string;
    isProxyManaged?: boolean;
    enteredByName?: string | null;
    hasRecord: boolean;
    forwardCount: number;
    reverseCount: number;
    note: string | null;
    dailyRole: DailyRoleType | null;
  };
}) {
  const roleTagClass =
    employee.dailyRole === "TRUCK_DRIVER"
      ? "bg-blue-50 text-blue-700"
      : employee.dailyRole === "TRUCK_ATTENDANT"
        ? "bg-green-50 text-green-700"
        : "bg-gray-100 text-gray-500";

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5 shadow-sm ${
        employee.hasRecord ? "border-gray-200 bg-white" : "border-red-200 bg-red-50"
      }`}
    >
      <div
        className={`flex h-8.5 w-8.5 flex-shrink-0 items-center justify-center rounded-lg text-sm font-extrabold ${
          employee.hasRecord ? "bg-gray-100 text-gray-600" : "border border-red-200 bg-white text-red-600"
        }`}
        style={{ height: 34, width: 34 }}
      >
        {employee.name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-gray-800">{employee.name}</span>
          {employee.isProxyManaged && (
            <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10.5px] font-bold text-purple-800">代管</span>
          )}
          {employee.dailyRole && employee.dailyRole !== "NONE" && (
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${roleTagClass}`}>
              {dailyRoleLabels[employee.dailyRole]}
            </span>
          )}
        </div>
        {employee.note && <p className="mt-0.5 text-[11px] text-gray-400">{employee.note}</p>}
        {employee.hasRecord && employee.enteredByName && (
          <p className="mt-0.5 text-[11px] text-purple-700">由 {employee.enteredByName} 代填</p>
        )}
      </div>
      {employee.hasRecord && (
        <div className="flex flex-shrink-0 gap-4">
          <div className="text-right">
            <p className="text-[10px] text-gray-400">正物流</p>
            <p className="font-mono text-sm font-bold">{employee.forwardCount}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400">逆物流</p>
            <p className="font-mono text-sm font-bold">{employee.reverseCount}</p>
          </div>
        </div>
      )}
      {!employee.hasRecord && employee.isProxyManaged && (
        <Link
          to={`/delivery?proxy=1&date=${date}`}
          className="flex-shrink-0 rounded-full bg-purple-700 px-3 py-1 text-[11px] font-bold text-white hover:bg-purple-800"
        >
          去代填
        </Link>
      )}
      <span
        className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${
          employee.hasRecord ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-white text-red-600"
        }`}
      >
        {employee.hasRecord ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        {employee.hasRecord ? "已填寫" : "尚未填寫"}
      </span>
    </div>
  );
}
