import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { WeekTotals, WeeklyReport } from "../../api/types";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function md(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 本週週一（本地日期）
function thisMonday(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// 跟上週比：▲▼ 與百分比（上週為 0 時只顯示差額）
function Delta({ cur, prev, unit = "" }: { cur: number; prev: number; unit?: string }) {
  if (cur === prev) return <span className="text-xs text-gray-400">跟上週一樣</span>;
  const up = cur > prev;
  const pct = prev !== 0 ? `${Math.round((Math.abs(cur - prev) / prev) * 100)}%` : `${Math.round(Math.abs(cur - prev)).toLocaleString()}${unit}`;
  return (
    <span className="text-xs text-gray-600">
      {up ? "▲" : "▼"} {pct}
    </span>
  );
}

function Tile({ label, value, sub, delta }: { label: string; value: string; sub: string; delta: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-gray-900">{value}</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
        {delta}
        <span className="text-xs text-gray-400">{sub}</span>
      </div>
    </div>
  );
}

function spend(t: WeekTotals) {
  return t.fuel + t.parking + t.maintenance;
}

// 營運總覽「週報」：一週（週一到週日）的件數、預估營收、花費、每人件數，和前一週比
export function WeeklyReportPanel() {
  const [start, setStart] = useState<string | null>(null); // null＝上週（後端預設）
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const loading = loadedFor !== start;

  useEffect(() => {
    let active = true;
    apiClient
      .get<WeeklyReport>("/reports/weekly", { params: start ? { start } : {} })
      .then(({ data }) => {
        if (!active) return;
        setReport(data);
        setError(null);
      })
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoadedFor(start));
    return () => {
      active = false;
    };
  }, [start]);

  const monday = thisMonday();
  const canNext = !!report && addDays(report.start, 7) <= monday;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="上一週"
            disabled={!report}
            onClick={() => report && setStart(report.prevStart)}
            className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="min-w-[11rem] text-center text-base font-semibold text-gray-800">
            {report ? `${md(report.start)}（一）～ ${md(report.end)}（日）` : "　"}
          </p>
          <button
            type="button"
            aria-label="下一週"
            disabled={!canNext}
            onClick={() => report && setStart(addDays(report.start, 7))}
            className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={() => setStart(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100">
            上週
          </button>
          <button type="button" onClick={() => setStart(monday)} className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100">
            本週到目前
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!report && loading && <p className="text-sm text-gray-500">載入中...</p>}

      {report && (
        <div className={`space-y-5 ${loading ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="總件數"
              value={report.totals.total.toLocaleString()}
              sub={`上週 ${report.prev.total.toLocaleString()}`}
              delta={<Delta cur={report.totals.total} prev={report.prev.total} unit=" 件" />}
            />
            <Tile
              label={report.totals.revenue !== null && !report.totals.revenueComplete ? "預估營收（部分月份沒單價）" : "預估營收"}
              value={report.totals.revenue === null ? "未設定單價" : money(report.totals.revenue)}
              sub={report.prev.revenue === null ? "上週 —" : `上週 ${money(report.prev.revenue)}`}
              delta={
                report.totals.revenue !== null && report.prev.revenue !== null ? (
                  <Delta cur={report.totals.revenue} prev={report.prev.revenue} />
                ) : (
                  <span />
                )
              }
            />
            <Tile
              label="出勤人次"
              value={`${report.totals.attendance}`}
              sub={`${report.totals.people} 人・上週 ${report.prev.attendance}`}
              delta={<Delta cur={report.totals.attendance} prev={report.prev.attendance} unit=" 人次" />}
            />
            <Tile
              label="油資＋停車＋維修"
              value={money(spend(report.totals))}
              sub={`上週 ${money(spend(report.prev))}`}
              delta={<Delta cur={spend(report.totals)} prev={spend(report.prev)} />}
            />
          </div>

          <DayBars days={report.days} />

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">需要注意</h3>
            <ul className="divide-y divide-gray-50 text-sm">
              <Notice
                show={report.anomalies !== null && report.anomalies > 0}
                text={`這週有 ${report.anomalies} 筆資料可能打錯`}
                link="/admin?tab=checks"
                linkText="去確認"
              />
              <Notice
                show={report.pendingExpenseCount > 0}
                text={`這週的油資／停車費還有 ${report.pendingExpenseCount} 筆待審核`}
                link="/review"
                linkText="去審核"
              />
              <Notice
                show={report.missingPricing.length > 0}
                text={`${report.missingPricing.map((ym) => `${Number(ym.slice(5))} 月`).join("、")}還沒設定收入單價，營收沒算進去`}
                link="/admin/settings"
                linkText="去設定"
              />
              <Notice
                show={report.absent.length > 0}
                text={`這週沒有送件紀錄：${report.absent.join("、")}`}
                link="/admin?tab=day"
                linkText="看送件狀況"
              />
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-gray-700">
                  {report.salary.month} 月薪資{report.salary.locked ? "（已封存）" : "（到目前預估）"}{" "}
                  <span className="font-mono font-semibold text-gray-900">{money(report.salary.total)}</span>
                </span>
                <Link to="/admin/salary" className="text-blue-600 hover:underline">
                  看薪資
                </Link>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-gray-600">
                <span>
                  油資 {money(report.totals.fuel)}・停車 {money(report.totals.parking)}・維修保養 {money(report.totals.maintenance)}
                </span>
                {report.pendingReviews > 0 && (
                  <Link to="/review" className="text-blue-600 hover:underline">
                    目前共 {report.pendingReviews} 筆待審核
                  </Link>
                )}
              </li>
            </ul>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">每人這週</h3>
            {report.employees.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-500">這週沒有送件紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">姓名</th>
                      <th className="whitespace-nowrap px-4 py-2 text-right font-medium">出勤</th>
                      <th className="hidden whitespace-nowrap px-4 py-2 text-right font-medium sm:table-cell">正物流</th>
                      <th className="hidden whitespace-nowrap px-4 py-2 text-right font-medium sm:table-cell">逆物流</th>
                      <th className="whitespace-nowrap px-4 py-2 text-right font-medium">合計</th>
                      <th className="whitespace-nowrap px-4 py-2 text-right font-medium">日均</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    {report.employees.map((e) => (
                      <tr key={e.userId} className="border-t border-gray-100">
                        <td className="whitespace-nowrap px-4 py-2 font-sans text-gray-800">{e.name}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{e.days} 天</td>
                        <td className="hidden px-4 py-2 text-right sm:table-cell">{e.forward.toLocaleString()}</td>
                        <td className="hidden px-4 py-2 text-right sm:table-cell">{e.reverse.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-semibold">{e.total.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{e.avg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Notice({ show, text, link, linkText }: { show: boolean; text: string; link: string; linkText: string }) {
  if (!show) return null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      <span className="text-gray-800">{text}</span>
      <Link to={link} className="text-blue-600 hover:underline">
        {linkText}
      </Link>
    </li>
  );
}

// 每天件數長條（單一數列不需圖例；只標最高的一天，其餘數字在下方一列）
function DayBars({ days }: { days: WeeklyReport["days"] }) {
  const totals = days.map((d) => d.forward + d.reverse);
  const max = Math.max(...totals, 1);
  const peak = totals.indexOf(Math.max(...totals));
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-800">每天件數</h3>
      <div className="mt-4 grid h-32 grid-cols-7 items-end gap-0.5 border-b border-gray-200">
        {days.map((d, i) => (
          <div
            key={d.date}
            className="relative flex h-full flex-col justify-end px-1.5"
            title={`${md(d.date)}（${WEEKDAYS[i]}）正物流 ${d.forward}、逆物流 ${d.reverse}，${d.attendance} 人出勤`}
          >
            {i === peak && totals[i] > 0 && (
              <span className="absolute inset-x-0 text-center font-mono text-xs text-gray-700" style={{ bottom: `${(totals[i] / max) * 100}%` }}>
                {totals[i].toLocaleString()}
              </span>
            )}
            <div className="mx-auto w-full max-w-[56px] rounded-t bg-blue-500" style={{ height: `${(totals[i] / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5 text-center">
        {days.map((d, i) => (
          <div key={d.date} className="text-xs">
            <p className="text-gray-500">
              {WEEKDAYS[i]} <span className="text-gray-400">{md(d.date)}</span>
            </p>
            <p className="font-mono text-gray-700">{totals[i].toLocaleString()}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
