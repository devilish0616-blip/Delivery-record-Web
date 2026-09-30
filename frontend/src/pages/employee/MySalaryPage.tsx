import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, Eye } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { DailyRoleType, EmployeeMonthlySalary, User } from "../../api/types";
import { YearMonthPicker } from "../../components/YearMonthPicker";

type SalaryView = EmployeeMonthlySalary & { locked?: boolean };

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function money(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? "-" : ""}$${Math.abs(r).toLocaleString()}`;
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

const ROLE_LABEL: Partial<Record<DailyRoleType, string>> = { TRUCK_DRIVER: "司機", TRUCK_ATTENDANT: "隨車" };

// 員工看自己的薪資；董事長／執行長可切換成任一員工，看到的畫面與該員工完全相同
export function MySalaryPage() {
  const { user } = useAuth();
  const canViewOthers = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [searchParams, setSearchParams] = useSearchParams();
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [targetId, setTargetId] = useState(() => (canViewOthers ? searchParams.get("userId") ?? "" : ""));
  const [employees, setEmployees] = useState<User[]>([]);
  const [salary, setSalary] = useState<SalaryView | null>(null);
  const [prev, setPrev] = useState<SalaryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewingOther = canViewOthers && targetId !== "" && targetId !== user?.id;

  useEffect(() => {
    if (!canViewOthers) return;
    apiClient
      .get<User[]>("/employees")
      .then(({ data }) => setEmployees(data.filter((u) => u.isActive)))
      .catch(() => setEmployees([]));
  }, [canViewOthers]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const path = viewingOther ? `/salary/${targetId}` : "/salary/me";
    const p = prevMonth(year, month);
    Promise.all([
      apiClient.get<SalaryView>(path, { params: { year, month } }),
      apiClient.get<SalaryView>(path, { params: p }).catch(() => null),
    ])
      .then(([cur, before]) => {
        if (!active) return;
        setSalary(cur.data);
        setPrev(before?.data ?? null);
      })
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [year, month, targetId, viewingOther]);

  function pickEmployee(id: string) {
    setTargetId(id);
    setSearchParams(id ? { userId: id } : {}, { replace: true });
  }

  const title = viewingOther ? `${salary?.userName ?? "員工"} 的薪資` : "我的薪資";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">{title}</h1>
        <YearMonthPicker year={year} month={month} onChange={(y, m) => setYearMonth({ year: y, month: m })} />
      </div>

      {canViewOthers && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ${
            viewingOther ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"
          }`}
        >
          <Eye className={`h-4 w-4 ${viewingOther ? "text-purple-700" : "text-gray-500"}`} />
          <label className="text-sm text-gray-700" htmlFor="salary-viewer">
            檢視員工畫面
          </label>
          <select
            id="salary-viewer"
            value={targetId}
            onChange={(e) => pickEmployee(e.target.value)}
            className="h-9 min-w-[160px] rounded-lg border border-gray-300 bg-white px-2 text-sm"
          >
            <option value="">我自己</option>
            {employees
              .filter((u) => u.id !== user?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
          {viewingOther && (
            <>
              <span className="text-xs text-purple-800">這就是 {salary?.userName ?? "該員工"} 登入後看到的畫面（唯讀）</span>
              <button
                type="button"
                onClick={() => pickEmployee("")}
                className="ml-auto rounded-md border border-purple-300 bg-white px-2.5 py-1 text-xs text-purple-800 hover:bg-purple-100"
              >
                回到我自己
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && !salary && <p className="text-sm text-gray-500">載入中...</p>}

      {salary && <SalaryBody salary={salary} prev={prev} loading={loading} />}

      {viewingOther && user?.role === "ADMIN" && (
        <p className="text-center text-xs text-gray-500">
          要調整扣款或加給，請到 <Link to="/admin/salary" className="text-blue-600 hover:underline">薪資計算</Link>。
        </p>
      )}
    </div>
  );
}

function SalaryBody({ salary: s, prev, loading }: { salary: SalaryView; prev: SalaryView | null; loading: boolean }) {
  const earnings = [
    { key: "piece", label: "件數薪資", amount: s.pieceWorkTotal, color: "bg-blue-600", hero: "bg-sky-300", sub: `${s.totalDeliveryCount} 件 × $${s.pieceRate}` },
    { key: "driver", label: "司機加給", amount: s.driverBonusTotal, color: "bg-indigo-500", hero: "bg-violet-300", sub: `${s.driverDays} 天 × $${s.driverBonus}` },
    { key: "attendant", label: "隨車加給", amount: s.attendantBonusTotal, color: "bg-indigo-300", hero: "bg-violet-100", sub: `${s.attendantDays} 天 × $${s.attendantBonus}` },
    { key: "job", label: "職務加給", amount: s.jobAllowance, color: "bg-violet-500", hero: "bg-fuchsia-300", sub: "每月固定" },
    { key: "incentive", label: "激勵獎金", amount: s.incentiveBonus, color: "bg-teal-500", hero: "bg-amber-200", sub: "達標獎勵" },
  ].filter((e) => e.amount !== 0);
  const subsidies = s.fuelAllowance + s.parkingFeeAllowance;
  const gross = earnings.reduce((sum, e) => sum + e.amount, 0) + subsidies;
  const delta = prev ? s.totalSalary - prev.totalSalary : null;

  return (
    <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {/* 本月實領 */}
      <section className="rounded-2xl bg-blue-700 p-5 text-white shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-blue-100">
            {s.year} 年 {s.month} 月・{s.locked ? "實領薪資" : "預估薪資"}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              s.locked ? "bg-white text-blue-800" : "bg-amber-300 text-amber-950"
            }`}
          >
            {s.locked ? "✓ 已結算" : "試算中"}
          </span>
        </div>
        <div className="mt-1 font-mono text-4xl font-bold tracking-tight">{money(s.totalSalary)}</div>
        <div className="mt-1 text-sm text-blue-100">
          {delta === null || !prev?.totalSalary
            ? "　"
            : `較上月 ${delta >= 0 ? "▲" : "▼"} ${money(Math.abs(delta))}`}
        </div>
        {!s.locked && (
          <p className="mt-2 text-xs text-blue-100">月底結算前，件數或扣款若有更新，金額會跟著變動。</p>
        )}

        {gross > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex h-3 gap-px overflow-hidden rounded-full bg-blue-900/40">
              {earnings.map((e) => (
                <div key={e.key} className={e.hero} style={{ width: `${(e.amount / gross) * 100}%` }} />
              ))}
              {subsidies > 0 && <div className="bg-emerald-300" style={{ width: `${(subsidies / gross) * 100}%` }} />}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-blue-100">
              {earnings.map((e) => (
                <span key={e.key} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-sm ${e.hero}`} />
                  {e.label}
                </span>
              ))}
              {subsidies > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-emerald-300" />
                  補貼
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 出勤概況 */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="出勤" value={`${s.attendanceDays}`} unit="天" />
        <Stat label="總件數" value={s.totalDeliveryCount.toLocaleString()} unit="件" />
        <Stat label="日平均" value={s.averageDailyCount.toFixed(1)} unit="件" />
        <Stat label="單價" value={`$${s.pieceRate}`} unit="/件" />
      </section>

      {/* 薪資怎麼算 */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">薪資怎麼算</h2>
        <div className="divide-y divide-gray-50">
          {earnings.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">本月尚無收入項目</p>}
          {earnings.map((e) => (
            <Line key={e.key} label={e.label} sub={e.sub} amount={e.amount} dot={e.color} />
          ))}
          {s.deductions.length > 0 && (
            <Expandable
              label="扣款"
              sub={`${s.deductions.length} 筆`}
              amount={-s.deductionTotal}
              tone="neg"
            >
              {s.deductions.map((d) => (
                <div key={d.id} className="flex justify-between px-4 py-1.5 text-sm">
                  <span className="text-gray-600">{d.reason}</span>
                  <span className="font-mono text-red-700">-{money(d.amount)}</span>
                </div>
              ))}
            </Expandable>
          )}
          <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 text-sm">
            <span className="font-semibold text-gray-700">薪資小計（不含補貼）</span>
            <span className="font-mono font-semibold">{money(s.totalSalaryExcludingSubsidy)}</span>
          </div>
          {s.fuelAllowance > 0 && (
            <Expandable label="油資補貼" sub={`${s.fuelAllowanceItems.length} 筆加油回報`} amount={s.fuelAllowance} tone="pos">
              {s.fuelAllowanceItems.map((i) => (
                <div key={i.id} className="flex justify-between px-4 py-1.5 text-sm">
                  <span className="text-gray-600">
                    {i.date}
                    {i.note && <span className="ml-1 text-gray-400">{i.note}</span>}
                  </span>
                  <span className="font-mono text-emerald-700">+{money(i.amount)}</span>
                </div>
              ))}
            </Expandable>
          )}
          {s.parkingFeeAllowance > 0 && (
            <Expandable label="停車費補貼" sub={`${s.parkingFeeAllowanceItems.length} 筆停車費回報`} amount={s.parkingFeeAllowance} tone="pos">
              {s.parkingFeeAllowanceItems.map((i) => (
                <div key={i.id} className="flex justify-between px-4 py-1.5 text-sm">
                  <span className="text-gray-600">
                    {i.date}
                    {i.note && <span className="ml-1 text-gray-400">{i.note}</span>}
                  </span>
                  <span className="font-mono text-emerald-700">+{money(i.amount)}</span>
                </div>
              ))}
            </Expandable>
          )}
          <div className="flex items-center justify-between rounded-b-xl bg-blue-50 px-4 py-3">
            <span className="font-semibold text-blue-900">{s.locked ? "實領" : "預估實領"}</span>
            <span className="font-mono text-lg font-bold text-blue-900">{money(s.totalSalary)}</span>
          </div>
        </div>
      </section>

      {s.rateBreakdown && s.rateBreakdown.length > 0 && <RateLadder steps={s.rateBreakdown} rate={s.pieceRate} />}

      <DailySection salary={s} />

      {s.formulaNotes && (
        <details className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
          <summary className="cursor-pointer font-semibold text-gray-800">計算規則說明</summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed">{s.formulaNotes}</p>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-center shadow-sm">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-semibold text-gray-900">
        {value}
        <span className="ml-0.5 text-xs font-normal text-gray-500">{unit}</span>
      </div>
    </div>
  );
}

function Line({ label, sub, amount, dot }: { label: string; sub: string; amount: number; dot: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-800">{label}</div>
        <div className="text-xs text-gray-500">{sub}</div>
      </div>
      <span className="font-mono text-sm font-semibold text-gray-900">+{money(amount)}</span>
    </div>
  );
}

function Expandable({
  label,
  sub,
  amount,
  tone,
  children,
}: {
  label: string;
  sub: string;
  amount: number;
  tone: "pos" | "neg";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${tone === "neg" ? "bg-red-500" : "bg-emerald-400"}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gray-800">{label}</div>
          <div className="text-xs text-gray-500">{sub}・點開看明細</div>
        </div>
        <span className={`font-mono text-sm font-semibold ${tone === "neg" ? "text-red-700" : "text-emerald-700"}`}>
          {tone === "pos" ? "+" : ""}
          {money(amount)}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="bg-gray-50/70 py-1">{children}</div>}
    </div>
  );
}

// 單價怎麼來：固定單價＋各項門檻加給（達成的亮起）
function RateLadder({ steps, rate }: { steps: NonNullable<EmployeeMonthlySalary["rateBreakdown"]>; rate: number }) {
  return (
    <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm">
        <span className="font-semibold text-gray-800">單價怎麼來</span>
        <span className="text-xs text-gray-500">
          本月每件 <span className="font-mono font-semibold text-gray-800">${rate}</span>
        </span>
      </summary>
      <div className="divide-y divide-gray-50 border-t border-gray-100">
        {steps.map((st) => (
          <div key={st.key} className={`flex items-center gap-3 px-4 py-2 text-sm ${st.hit ? "" : "opacity-50"}`}>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                st.hit ? "bg-green-600 text-white" : "border border-gray-300 text-gray-400"
              }`}
            >
              {st.hit ? "✓" : ""}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-gray-800">{st.label}</div>
              {st.condition && <div className="text-xs text-gray-500">{st.condition}</div>}
            </div>
            <span className="font-mono text-gray-800">+${st.amount}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function DailySection({ salary: s }: { salary: SalaryView }) {
  const [showTable, setShowTable] = useState(false);
  const days = useMemo(() => {
    const count = new Date(Date.UTC(s.year, s.month, 0)).getUTCDate();
    const byDate = new Map(s.dailyDetails.map((d) => [d.date, d]));
    return Array.from({ length: count }, (_, i) => {
      const date = `${s.year}-${String(s.month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return { day: i + 1, date, detail: byDate.get(date) };
    });
  }, [s]);
  const max = Math.max(1, ...s.dailyDetails.map((d) => d.totalCount));

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">每日件數</h2>
        <div className="flex gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500" />一般</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-indigo-700" />司機</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-indigo-300" />隨車</span>
        </div>
      </div>
      {s.dailyDetails.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500">本月尚無送件紀錄</p>
      ) : (
        <>
          <div className="flex h-28 items-end gap-[2px] px-4 pt-3">
            {days.map(({ day, detail }) => {
              const color =
                detail?.role === "TRUCK_DRIVER" ? "bg-indigo-700" : detail?.role === "TRUCK_ATTENDANT" ? "bg-indigo-300" : "bg-blue-500";
              return (
                <div
                  key={day}
                  className="flex h-full flex-1 flex-col justify-end"
                  title={detail ? `${s.month}/${day}：${detail.totalCount} 件（$${detail.subtotal.toLocaleString()}）` : `${s.month}/${day}：未出勤`}
                >
                  {detail ? (
                    <div className={`rounded-t-sm ${color}`} style={{ height: `${Math.max(4, (detail.totalCount / max) * 100)}%` }} />
                  ) : (
                    <div className="h-[2px] bg-gray-200" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between px-4 pb-2 pt-1 text-[10px] text-gray-400">
            <span>1日</span>
            <span>{Math.ceil(days.length / 2)}日</span>
            <span>{days.length}日</span>
          </div>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="flex w-full items-center justify-center gap-1 border-t border-gray-100 py-2 text-xs text-blue-700 hover:bg-gray-50"
          >
            {showTable ? "收起每日明細" : `看每日明細（${s.dailyDetails.length} 天）`}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTable ? "rotate-180" : ""}`} />
          </button>
          {showTable && (
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-2 text-left font-normal">日期</th>
                    <th className="px-3 py-2 text-right font-normal">正物流</th>
                    <th className="px-3 py-2 text-right font-normal">逆物流</th>
                    <th className="px-3 py-2 text-right font-normal">合計</th>
                    <th className="px-3 py-2 text-right font-normal">當日薪資</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {s.dailyDetails.map((d) => (
                    <tr key={d.date}>
                      <td className="px-3 py-2 text-gray-700">
                        {d.date.slice(5).replace("-", "/")}
                        {ROLE_LABEL[d.role] && (
                          <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-800">{ROLE_LABEL[d.role]}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{d.forwardCount}</td>
                      <td className="px-3 py-2 text-right font-mono">{d.reverseCount}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{d.totalCount}</td>
                      <td className="px-3 py-2 text-right font-mono">{money(d.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
