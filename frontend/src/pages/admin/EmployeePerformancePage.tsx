import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { EmployeePerformanceData, MonthStat } from "../../api/types";

type Metric = "total" | "forwardCount" | "reverseCount";

const METRICS: { key: Metric; label: string }[] = [
  { key: "total", label: "總件數" },
  { key: "forwardCount", label: "正物流" },
  { key: "reverseCount", label: "逆物流" },
];

const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

function fmt(n: number): string {
  return n.toLocaleString();
}

// 熱力格顏色：依數值在 [min, max] 的位置於四段藍色間內插
const HEAT_STOPS = [
  [238, 243, 255],
  [169, 192, 248],
  [74, 120, 232],
  [29, 63, 176],
];
function heatStyle(v: number, min: number, max: number): { background: string; color: string } {
  const t = max > min ? (v - min) / (max - min) : 1;
  const p = t * 3;
  const k = Math.min(2, Math.floor(p));
  const f = p - k;
  const c = HEAT_STOPS[k].map((x, j) => Math.round(x + (HEAT_STOPS[k + 1][j] - x) * f));
  return { background: `rgb(${c.join(",")})`, color: t > 0.45 ? "#ffffff" : "#1e293b" };
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  // 加 BOM 讓 Excel 正確辨識中文
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EmployeePerformancePage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [metric, setMetric] = useState<Metric>("total");
  const [rankMonth, setRankMonth] = useState<number | null>(null);
  const [data, setData] = useState<EmployeePerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(targetYear: number) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<EmployeePerformanceData>(`/deliveries/performance/${targetYear}`);
      setData(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRankMonth(null);
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // 已經過（含當月）的月份數；未來月份顯示為「–」
  const elapsedMonths = year < currentYear ? 12 : year === currentYear ? now.getMonth() + 1 : 0;
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  const stats = useMemo(() => {
    if (!data) return null;
    const pick = (m: MonthStat) => m[metric];
    const employees = data.employees.map((e) => ({
      ...e,
      vals: e.months.map(pick),
      sum: pick(e.yearTotal),
    }));
    const sorted = [...employees].sort((a, b) => b.sum - a.sum);
    const total = employees.reduce((a, e) => a + e.sum, 0);
    const monthTotals = Array.from({ length: 12 }, (_, i) => employees.reduce((a, e) => a + e.vals[i], 0));
    const monthFwd = Array.from({ length: 12 }, (_, i) => data.employees.reduce((a, e) => a + e.months[i].forwardCount, 0));
    const monthRev = Array.from({ length: 12 }, (_, i) => data.employees.reduce((a, e) => a + e.months[i].reverseCount, 0));
    const activeCount = employees.filter((e) => e.yearTotal.total > 0).length;
    const peakIdx = monthTotals.reduce((best, v, i) => (v > monthTotals[best] ? i : best), 0);
    const nonZero = employees.flatMap((e) => e.vals.filter((v, i) => i < elapsedMonths && v > 0));
    return {
      employees,
      sorted,
      total,
      monthTotals,
      monthFwd,
      monthRev,
      activeCount,
      peakIdx,
      cellMin: nonZero.length ? Math.min(...nonZero) : 0,
      cellMax: nonZero.length ? Math.max(...nonZero) : 0,
    };
  }, [data, metric, elapsedMonths]);

  const shownRankMonth = rankMonth ?? Math.max(0, elapsedMonths - 1);

  function exportCsv() {
    if (!stats) return;
    const rows: (string | number)[][] = [
      ["員工", ...monthLabels, `全年合計（${metricLabel}）`, "正物流合計", "逆物流合計"],
      ...stats.sorted.map((e) => [
        e.name,
        ...e.vals,
        e.sum,
        e.yearTotal.forwardCount,
        e.yearTotal.reverseCount,
      ]),
      ["合計", ...stats.monthTotals, stats.total, "", ""],
    ];
    downloadCsv(`員工績效_${year}_${metricLabel}.csv`, rows);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">員工績效統計</h1>
          <p className="mt-0.5 text-sm text-gray-500">依員工每日送件回報彙整（僅列啟用中帳號）</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  metric === m.key ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-800"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-md border border-gray-300 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
              aria-label="上一年"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 font-mono text-sm font-semibold text-gray-800">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear}
              className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="下一年"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!stats || stats.employees.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            匯出 CSV
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : !stats || stats.employees.length === 0 ? (
        <p className="text-sm text-gray-500">尚無資料</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={`年度累計（${metricLabel}）`} value={fmt(stats.total)} sub={`${elapsedMonths} 個月・${stats.activeCount} 位有送件`} />
            <Kpi
              label="每月平均"
              value={fmt(Math.round(stats.total / Math.max(1, elapsedMonths)))}
              sub={`人均每月 ${fmt(Math.round(stats.total / Math.max(1, elapsedMonths) / Math.max(1, stats.activeCount)))} 件`}
            />
            <Kpi
              label="最高月份"
              value={stats.monthTotals[stats.peakIdx] > 0 ? `${stats.peakIdx + 1} 月` : "-"}
              sub={`${fmt(stats.monthTotals[stats.peakIdx])} 件`}
            />
            <div className="rounded-xl bg-blue-700 px-4 py-3 text-white shadow-sm">
              <div className="text-xs text-blue-100">年度第一名</div>
              <div className="mt-1 truncate text-2xl font-bold">{stats.sorted[0].sum > 0 ? stats.sorted[0].name : "-"}</div>
              <div className="mt-0.5 text-xs text-blue-100">
                <span className="font-mono">{fmt(stats.sorted[0].sum)}</span> 件・占全體{" "}
                <span className="font-mono">
                  {stats.total > 0 ? `${Math.round((stats.sorted[0].sum / stats.total) * 1000) / 10}%` : "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <MonthlyBars
              fwd={stats.monthFwd}
              rev={stats.monthRev}
              elapsedMonths={elapsedMonths}
              selected={shownRankMonth}
              onSelect={setRankMonth}
            />
            <MonthRanking
              month={shownRankMonth}
              metricLabel={metricLabel}
              items={stats.employees
                .map((e) => ({ id: e.userId, name: e.name, val: e.vals[shownRankMonth] }))
                .filter((e) => e.val > 0)
                .sort((a, b) => b.val - a.val)
                .slice(0, 5)}
            />
          </div>

          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-800">員工 × 月份（{metricLabel}）</h2>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                少
                {HEAT_STOPS.map((c, i) => (
                  <span key={i} className="h-3 w-4 rounded-sm" style={{ background: `rgb(${c.join(",")})` }} />
                ))}
                多・依全年合計排序
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-separate border-spacing-1 px-3 py-2 text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="w-8 text-left font-normal">#</th>
                    <th className="sticky left-0 z-10 w-24 bg-white text-left font-normal">員工</th>
                    {monthLabels.map((l) => (
                      <th key={l} className="text-center font-normal">
                        {l}
                      </th>
                    ))}
                    <th className="text-right font-normal">全年合計</th>
                    <th className="w-32 text-right font-normal">正 / 逆 比例</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sorted.map((e, rank) => {
                    const yt = e.yearTotal;
                    const fwdPct = yt.total > 0 ? Math.round((yt.forwardCount / yt.total) * 100) : 0;
                    return (
                      <tr key={e.userId} className={e.sum === 0 ? "opacity-50" : ""}>
                        <td className="font-mono text-xs text-gray-500">{rank + 1}</td>
                        <td className="sticky left-0 z-10 truncate bg-white font-semibold text-gray-800">{e.name}</td>
                        {e.vals.map((v, i) => {
                          const future = i >= elapsedMonths;
                          const style = !future && v > 0 ? heatStyle(v, stats.cellMin, stats.cellMax) : undefined;
                          return (
                            <td
                              key={i}
                              className={`h-8 rounded text-center font-mono text-xs ${
                                style ? "" : future ? "bg-gray-50 text-gray-300" : "bg-gray-50 text-gray-400"
                              }`}
                              style={style}
                            >
                              {future ? "–" : v === 0 ? "0" : fmt(v)}
                            </td>
                          );
                        })}
                        <td className="text-right font-mono font-semibold text-gray-900">{fmt(e.sum)}</td>
                        <td>
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                              {yt.total > 0 && (
                                <>
                                  <div className="bg-blue-600" style={{ width: `${fwdPct}%` }} />
                                  <div className="flex-1 bg-amber-500" />
                                </>
                              )}
                            </div>
                            <span className="font-mono text-[11px] text-gray-500">
                              {fmt(yt.forwardCount)} / {fmt(yt.reverseCount)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="text-xs">
                    <td />
                    <td className="sticky left-0 z-10 border-t border-gray-200 bg-white pt-2 font-semibold text-gray-700">
                      合計
                    </td>
                    {stats.monthTotals.map((v, i) => (
                      <td key={i} className="border-t border-gray-200 pt-2 text-center font-mono text-gray-700">
                        {i >= elapsedMonths ? "–" : fmt(v)}
                      </td>
                    ))}
                    <td className="border-t border-gray-200 pt-2 text-right font-mono text-sm font-bold text-gray-900">
                      {fmt(stats.total)}
                    </td>
                    <td className="border-t border-gray-200" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{sub}</div>
    </div>
  );
}

// 全體每月件數：正物流（藍）與逆物流（橘）疊加長條，點選長條可切換右側排行月份
function MonthlyBars({
  fwd,
  rev,
  elapsedMonths,
  selected,
  onSelect,
}: {
  fwd: number[];
  rev: number[];
  elapsedMonths: number;
  selected: number;
  onSelect: (m: number) => void;
}) {
  const max = Math.max(1, ...fwd.map((f, i) => f + rev[i]));
  const barH = 170;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">每月件數（全體）</h2>
        <div className="flex gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
            正物流
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
            逆物流
          </span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 border-b border-gray-200 sm:gap-3" style={{ height: barH + 22 }}>
        {fwd.map((f, i) => {
          const future = i >= elapsedMonths;
          const total = f + rev[i];
          return (
            <button
              key={i}
              type="button"
              disabled={future}
              onClick={() => onSelect(i)}
              title={future ? undefined : `${i + 1}月：正 ${fmt(f)}／逆 ${fmt(rev[i])}／共 ${fmt(total)}`}
              className={`group flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t ${
                selected === i && !future ? "bg-blue-50" : ""
              }`}
            >
              {!future && total > 0 && (
                <span className="mb-1 hidden font-mono text-[10px] text-gray-600 sm:block">{fmt(total)}</span>
              )}
              <span
                className="w-full max-w-[40px] rounded-t bg-amber-500 group-hover:opacity-80"
                style={{ height: future ? 0 : (rev[i] / max) * barH }}
              />
              <span
                className="w-full max-w-[40px] bg-blue-600 group-hover:opacity-80"
                style={{ height: future ? 2 : Math.max(total > 0 ? 1 : 2, (f / max) * barH) }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-3">
        {monthLabels.map((l, i) => (
          <div
            key={l}
            className={`min-w-0 flex-1 text-center text-[11px] ${selected === i ? "font-semibold text-blue-700" : "text-gray-500"}`}
          >
            {l}
          </div>
        ))}
      </div>
    </section>
  );
}

function MonthRanking({
  month,
  metricLabel,
  items,
}: {
  month: number;
  metricLabel: string;
  items: { id: string; name: string; val: number }[];
}) {
  const max = items[0]?.val ?? 1;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">{month + 1} 月排行</h2>
        <span className="text-xs text-gray-500">{metricLabel}・點左圖切換月份</span>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">本月尚無送件紀錄</p>
      ) : (
        <ol className="space-y-3">
          {items.map((it, i) => (
            <li key={it.id}>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded font-mono text-xs font-semibold ${
                    i === 0 ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-gray-800">{it.name}</span>
                <span className="font-mono font-semibold text-gray-900">{fmt(it.val)}</span>
              </div>
              <div className="ml-7 mt-1 h-1.5 rounded-full bg-gray-100">
                <div
                  className={`h-1.5 rounded-full ${i === 0 ? "bg-blue-700" : "bg-blue-300"}`}
                  style={{ width: `${(it.val / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
