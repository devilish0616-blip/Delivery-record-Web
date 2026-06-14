import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DashboardData, DailyRoleType, Role } from "../../api/types";

const quickLinks = [
  { to: "/admin/salary", label: "薪資計算" },
  { to: "/admin/dispatch", label: "派遣紀錄" },
  { to: "/admin/reconciliation", label: "貨運行對帳" },
  { to: "/admin/vehicles", label: "車輛管理" },
  { to: "/admin/employees", label: "員工管理" },
  { to: "/admin/settings", label: "系統設定" },
];

const roleLabels: Record<Role, string> = {
  ADMIN: "管理者",
  MANAGER: "主管",
  EMPLOYEE: "員工",
};

const dailyRoleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function formatDateLabel(dateStr: string): { label: string; weekday: number } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return { label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, weekday: d.getUTCDay() };
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function profitClass(profit: number | null): string {
  if (profit === null) return "";
  return profit >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700";
}

export function DashboardPage() {
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [date, setDate] = useState(todayDateString());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get<DashboardData>("/dashboard", { params: { year, month, date } })
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
  }, [year, month, date]);

  const { today, month_summary, vehicles, todayMileage, alerts } = data ?? ({} as Partial<DashboardData>);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">
          管理者儀表板{data ? ` — ${data.year} 年 ${data.month} 月` : ""}
        </h1>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYearMonth((s) => ({ ...s, year: Number(e.target.value) }))}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setYearMonth((s) => ({ ...s, month: Number(e.target.value) }))}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m} 月
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">載入中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && month_summary && (
        <>
          {alerts &&
            (alerts.pricingNotSet ||
              alerts.unreconciledPreviousMonth ||
              alerts.vehiclesNeedingMaintenance.length > 0) && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-medium">待處理事項</p>
                <ul className="list-inside list-disc space-y-1">
                  {alerts.pricingNotSet && (
                    <li>
                      尚未設定本月（{data.year} 年 {data.month} 月）收入單價，
                      <Link to="/admin/settings" className="underline">
                        前往設定
                      </Link>
                    </li>
                  )}
                  {alerts.unreconciledPreviousMonth && (
                    <li>
                      尚未對帳 {alerts.unreconciledPreviousMonth.year} 年{" "}
                      {alerts.unreconciledPreviousMonth.month} 月，
                      <Link to="/admin/reconciliation" className="underline">
                        前往對帳
                      </Link>
                    </li>
                  )}
                  {alerts.vehiclesNeedingMaintenance.flatMap((v) =>
                    v.maintenanceItems
                      .filter((m) => m.needsChange || m.warning)
                      .map((m) => (
                        <li key={`${v.id}_${m.id}`}>
                          車輛 {v.plateNumber}：{m.itemName}{" "}
                          {m.needsChange ? "已逾期" : `剩餘 ${m.remaining.toFixed(0)} km`}，建議檢查
                        </li>
                      ))
                  )}
                </ul>
              </div>
            )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {today && (
          <>
            <Card label="今日正物流件數" value={`${today.forwardTotal}`} />
            <Card label="今日逆物流件數" value={`${today.reverseTotal}`} />
          </>
        )}
        <Card label="當月累計件數" value={`${month_summary.totalCount}`} />
        <Card label="當月預估薪資總支出" value={`$${month_summary.estimatedSalaryTotal.toLocaleString()}`} />
        <Card
          label="當月預估總收入"
          value={
            month_summary.estimatedRevenue !== null
              ? `$${month_summary.estimatedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : "尚未設定單價"
          }
        />
        <Card
          label="當月預估毛利"
          value={
            month_summary.estimatedProfit !== null
              ? `$${month_summary.estimatedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : "-"
          }
          highlight
        />
      </div>

      {data.dailyBreakdown.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
            每日營運總表
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">日期</th>
                  <th className="whitespace-nowrap px-3 py-2">總正物流</th>
                  <th className="whitespace-nowrap px-3 py-2">總逆物流</th>
                  <th className="whitespace-nowrap px-3 py-2">總件數（正+逆）</th>
                  <th className="whitespace-nowrap px-3 py-2">總支付薪資</th>
                  <th className="whitespace-nowrap px-3 py-2">營業營收</th>
                  <th className="whitespace-nowrap px-3 py-2">扣除薪水盈餘</th>
                  <th className="whitespace-nowrap px-3 py-2">平均件數獲利</th>
                  <th className="whitespace-nowrap px-3 py-2">出勤人數</th>
                  <th className="whitespace-nowrap px-3 py-2">司機</th>
                  <th className="whitespace-nowrap px-3 py-2">跟車</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyBreakdown.map((d) => {
                  const { label, weekday } = formatDateLabel(d.date);
                  const isWeekend = weekday === 0 || weekday === 6;
                  return (
                    <tr key={d.date} className="border-t border-gray-100">
                      <td
                        className={`whitespace-nowrap px-3 py-2 ${
                          isWeekend ? "text-red-600" : "text-gray-800"
                        }`}
                      >
                        {label}（{weekdayLabels[weekday]}）
                      </td>
                      <td className="px-3 py-2">{d.forwardCount}</td>
                      <td className="px-3 py-2">{d.reverseCount}</td>
                      <td className="px-3 py-2 font-medium">{d.totalCount}</td>
                      <td className="px-3 py-2">{formatCurrency(d.salaryCost)}</td>
                      <td className="px-3 py-2">{d.revenue !== null ? formatCurrency(d.revenue) : "-"}</td>
                      <td className={`px-3 py-2 ${profitClass(d.profit)}`}>
                        {d.profit !== null ? formatCurrency(d.profit) : "-"}
                      </td>
                      <td className={`px-3 py-2 ${profitClass(d.profit)}`}>
                        {d.profitPerItem !== null ? d.profitPerItem.toFixed(2) : "-"}
                      </td>
                      <td className="px-3 py-2">{d.attendanceCount}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {d.drivers.length > 0 ? d.drivers.join("、") : "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {d.attendants.length > 0 ? d.attendants.join("、") : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const totals = data.dailyBreakdown.reduce(
                    (acc, d) => {
                      acc.forwardCount += d.forwardCount;
                      acc.reverseCount += d.reverseCount;
                      acc.totalCount += d.totalCount;
                      acc.salaryCost += d.salaryCost;
                      if (d.revenue !== null) {
                        acc.revenue += d.revenue;
                        acc.hasRevenue = true;
                      }
                      return acc;
                    },
                    { forwardCount: 0, reverseCount: 0, totalCount: 0, salaryCost: 0, revenue: 0, hasRevenue: false }
                  );
                  const dayCount = data.dailyBreakdown.length;
                  const totalProfit = totals.hasRevenue ? totals.revenue - totals.salaryCost : null;
                  const totalProfitPerItem =
                    totalProfit !== null && totals.totalCount > 0 ? totalProfit / totals.totalCount : null;
                  return (
                    <>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                        <td className="whitespace-nowrap px-3 py-2">平均</td>
                        <td className="px-3 py-2">{Math.round(totals.forwardCount / dayCount)}</td>
                        <td className="px-3 py-2">{Math.round(totals.reverseCount / dayCount)}</td>
                        <td className="px-3 py-2">{Math.round(totals.totalCount / dayCount)}</td>
                        <td className="px-3 py-2">{formatCurrency(totals.salaryCost / dayCount)}</td>
                        <td className="px-3 py-2">
                          {totals.hasRevenue ? formatCurrency(totals.revenue / dayCount) : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {totalProfit !== null ? formatCurrency(totalProfit / dayCount) : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {totalProfitPerItem !== null ? totalProfitPerItem.toFixed(2) : "-"}
                        </td>
                        <td className="px-3 py-2" colSpan={3}></td>
                      </tr>
                      <tr className="bg-gray-50 font-medium">
                        <td className="whitespace-nowrap px-3 py-2">總計</td>
                        <td className="px-3 py-2">{totals.forwardCount}</td>
                        <td className="px-3 py-2">{totals.reverseCount}</td>
                        <td className="px-3 py-2">{totals.totalCount}</td>
                        <td className="px-3 py-2">{formatCurrency(totals.salaryCost)}</td>
                        <td className="px-3 py-2">{totals.hasRevenue ? formatCurrency(totals.revenue) : "-"}</td>
                        <td className="px-3 py-2">{totalProfit !== null ? formatCurrency(totalProfit) : "-"}</td>
                        <td className="px-3 py-2">
                          {totalProfitPerItem !== null ? totalProfitPerItem.toFixed(2) : "-"}
                        </td>
                        <td className="px-3 py-2" colSpan={3}></td>
                      </tr>
                    </>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {data.dailyStatus && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-medium text-gray-700">員工送件狀況</h2>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">姓名</th>
                  <th className="px-4 py-2">角色</th>
                  <th className="px-4 py-2">正物流件數</th>
                  <th className="px-4 py-2">逆物流件數</th>
                  <th className="px-4 py-2">今日角色</th>
                  <th className="px-4 py-2">備註</th>
                  <th className="px-4 py-2">填寫狀態</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyStatus.employees.map((e) => (
                  <tr key={e.userId} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{e.name}</td>
                    <td className="px-4 py-2 text-gray-500">{roleLabels[e.role]}</td>
                    <td className="px-4 py-2">{e.forwardCount}</td>
                    <td className="px-4 py-2">{e.reverseCount}</td>
                    <td className="px-4 py-2">{e.dailyRole ? dailyRoleLabels[e.dailyRole] : "-"}</td>
                    <td className="px-4 py-2 text-gray-500">{e.note ?? "-"}</td>
                    <td className="px-4 py-2">
                      {e.hasRecord ? (
                        <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">已填寫</span>
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">尚未填寫</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vehicles && todayMileage && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
            車輛狀況
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">車牌</th>
                  <th className="px-4 py-2">車型</th>
                  <th className="px-4 py-2">目前累計里程</th>
                  <th className="px-4 py-2">保養狀態</th>
                  <th className="px-4 py-2">今日使用</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const usage = todayMileage.filter((m) => m.vehicleId === v.id);
                  return (
                    <tr key={v.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">{v.plateNumber}</td>
                      <td className="px-4 py-2">{v.type === "MOTORCYCLE" ? "機車" : "貨車"}</td>
                      <td className="px-4 py-2">{v.currentMileage} km</td>
                      <td className="px-4 py-2">
                        {v.maintenanceItems.map((m) => (
                          <span
                            key={m.id}
                            className={`mr-2 inline-block ${
                              m.needsChange
                                ? "font-medium text-red-600"
                                : m.warning
                                ? "font-medium text-amber-600"
                                : "text-gray-500"
                            }`}
                          >
                            {m.itemName} {m.needsChange ? "已逾期" : `剩 ${m.remaining.toFixed(0)} km`}
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {usage.length === 0
                          ? "-"
                          : usage
                              .map(
                                (m) =>
                                  `${m.user?.name ?? ""} (${m.distance !== null ? `${m.distance} km` : "首次紀錄"})`
                              )
                              .join("、")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-gray-700">快速進入</h2>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${
        highlight ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${highlight ? "text-blue-700" : "text-gray-800"}`}>
        {value}
      </p>
    </div>
  );
}
