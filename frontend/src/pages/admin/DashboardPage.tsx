import { useEffect, useState, type ComponentType } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, ChevronRight, ClipboardList, Truck, type LucideProps } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DashboardData } from "../../api/types";

const quickLinks = [
  { to: "/admin/salary", label: "薪資計算" },
  { to: "/admin/dispatch", label: "派遣紀錄" },
  { to: "/admin/reconciliation", label: "貨運行對帳" },
  { to: "/admin/vehicles", label: "車輛管理" },
  { to: "/admin/employees", label: "員工管理" },
  { to: "/admin/settings", label: "系統設定" },
];

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get<DashboardData>("/dashboard", { params: { year, month } })
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
  }, [year, month]);

  const { today, month_summary, alerts } = data ?? ({} as Partial<DashboardData>);
  const vehiclesNeedingMaintenance = alerts?.vehiclesNeedingMaintenance.length ?? 0;

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

          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
            <EntryCard
              icon={BarChart3}
              title="每日營運總表"
              description="本月每日收入、件數、出勤人數"
              onClick={() => navigate("/admin/daily-operations")}
            />
            <EntryCard
              icon={ClipboardList}
              title="員工送件狀況"
              description="查看任一天所有員工送件明細"
              onClick={() => navigate("/admin/delivery-status")}
            />
            <EntryCard
              icon={Truck}
              title="車輛狀況"
              description="里程、保養狀態"
              onClick={() => navigate("/admin/vehicle-status")}
              badge={vehiclesNeedingMaintenance > 0 ? `${vehiclesNeedingMaintenance} 逾期` : undefined}
            />
          </div>

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

function EntryCard({
  icon: Icon,
  title,
  description,
  onClick,
  badge,
}: {
  icon: ComponentType<LucideProps>;
  title: string;
  description: string;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:bg-gray-50"
    >
      <Icon className="h-8 w-8 flex-shrink-0 text-blue-600" />
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
      {badge && (
        <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700">
          {badge}
        </span>
      )}
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-400" />
    </div>
  );
}
