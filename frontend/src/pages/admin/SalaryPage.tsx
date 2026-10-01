import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, Lock, Search, Unlock } from "lucide-react";
import { apiClient, downloadFile, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type {
  DailyRoleType,
  DailySalaryDetail,
  EmployeeMonthlySalary,
  MonthlySalaryResponse,
  SalaryLockStatus,
} from "../../api/types";
import { YearMonthPicker } from "../../components/YearMonthPicker";
import { ConfirmModal } from "../../components/Modal";
import { Drawer } from "../../components/Drawer";
import { DonutChart, DonutLegend, type DonutSlice } from "../../components/charts/DonutChart";
import { CompositionBar, CompositionLegendRows } from "../../components/salary/CompositionBar";
import { RateWaterfall } from "../../components/salary/RateWaterfall";
import { DeductionsPanel } from "../../components/salary/DeductionsPanel";
import { COMPOSITION_KEYS, COMPOSITION_META, compositionOf } from "../../constants/salaryComposition";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 該月份可選日期範圍（YYYY-MM-DD），用於管理者新增送件記錄時的日期選擇限制
function monthDateRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-${pad2(lastDay)}` };
}

// 新增送件記錄的預設日期：若為當月則帶入今天，否則帶入當月 1 日
function defaultAddDate(year: number, month: number): string {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() + 1 === month) {
    return `${year}-${pad2(month)}-${pad2(now.getDate())}`;
  }
  return `${year}-${pad2(month)}-01`;
}

const roleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

type SortKey = "total_desc" | "total_asc" | "days_desc" | "ded_desc";
type DrawerTab = "overview" | "daily" | "deductions";

export function SalaryPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canEditRole = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [salaries, setSalaries] = useState<EmployeeMonthlySalary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<SalaryLockStatus | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"lock" | "unlock" | null>(null);
  const locked = lockStatus?.locked ?? false;

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("total_desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");

  const [editingDaily, setEditingDaily] = useState<string | null>(null);
  const [editForward, setEditForward] = useState(0);
  const [editReverse, setEditReverse] = useState(0);
  const [savingDaily, setSavingDaily] = useState(false);
  const [savingRoleKey, setSavingRoleKey] = useState<string | null>(null);
  const [addingDaily, setAddingDaily] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [addForward, setAddForward] = useState(0);
  const [addReverse, setAddReverse] = useState(0);
  const [savingAdd, setSavingAdd] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [salaryRes, lockRes] = await Promise.all([
        apiClient.get<MonthlySalaryResponse>("/salary", { params: { year, month } }),
        apiClient.get<SalaryLockStatus>("/salary/lock-status", { params: { year, month } }),
      ]);
      setSalaries(salaryRes.data.salaries);
      setLockStatus(lockRes.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function handleLock() {
    setLockBusy(true);
    setError(null);
    try {
      await apiClient.post("/salary/lock", { year, month });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLockBusy(false);
      setConfirmAction(null);
    }
  }

  async function handleUnlock() {
    setLockBusy(true);
    setError(null);
    try {
      await apiClient.post("/salary/unlock", { year, month });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLockBusy(false);
      setConfirmAction(null);
    }
  }

  function openDrawer(userId: string, tab: DrawerTab = "overview") {
    setDrawerUserId(userId);
    setDrawerTab(tab);
    setEditingDaily(null);
    setAddingDaily(false);
  }
  function closeDrawer() {
    setDrawerUserId(null);
  }

  function startEditDaily(userId: string, d: DailySalaryDetail) {
    setEditingDaily(`${userId}_${d.date}`);
    setEditForward(d.forwardCount);
    setEditReverse(d.reverseCount);
  }

  async function handleSaveDaily(userId: string, date: string) {
    setSavingDaily(true);
    try {
      await apiClient.put(`/deliveries/${userId}/${date}`, {
        forwardCount: editForward,
        reverseCount: editReverse,
      });
      setEditingDaily(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingDaily(false);
    }
  }

  function startAddDaily() {
    setAddingDaily(true);
    setAddDate(defaultAddDate(year, month));
    setAddForward(0);
    setAddReverse(0);
  }

  async function handleSaveAddDaily(userId: string) {
    const salary = salaries.find((s) => s.userId === userId);
    const exists = salary?.dailyDetails.some((d) => d.date === addDate);
    if (exists && !window.confirm(`${addDate} 已有送件記錄，新增將會覆蓋原有資料，是否繼續？`)) {
      return;
    }
    setSavingAdd(true);
    try {
      await apiClient.put(`/deliveries/${userId}/${addDate}`, {
        forwardCount: addForward,
        reverseCount: addReverse,
      });
      setAddingDaily(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingAdd(false);
    }
  }

  async function handleDeleteDaily(userId: string, date: string) {
    if (!window.confirm(`確定要刪除 ${date} 的送件記錄與當日角色登記嗎？此操作無法復原。`)) return;
    try {
      await apiClient.delete(`/deliveries/${userId}/${date}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleRoleChange(userId: string, date: string, role: DailyRoleType) {
    setSavingRoleKey(`${userId}_${date}`);
    try {
      await apiClient.put(`/daily-roles/${userId}/${date}`, { role });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingRoleKey(null);
    }
  }

  async function handleExportAll() {
    try {
      await downloadFile(
        `/salary/export?year=${year}&month=${month}`,
        `salary-${year}-${String(month).padStart(2, "0")}.xlsx`
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleExportEmployee(userId: string, userName: string) {
    try {
      await downloadFile(
        `/salary/${userId}/export?year=${year}&month=${month}`,
        `薪資單_${userName}_${year}年${String(month).padStart(2, "0")}月.pdf`
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleBatchExport() {
    setBatchBusy(true);
    try {
      for (const s of salaries) {
        if (selected.has(s.userId)) {
          await handleExportEmployee(s.userId, s.userName);
        }
      }
    } finally {
      setBatchBusy(false);
    }
  }

  function toggleSelect(userId: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const filteredSorted = useMemo(() => {
    let list = salaries;
    if (search.trim()) {
      list = list.filter((s) => s.userName.includes(search.trim()));
    }
    list = [...list];
    switch (sortBy) {
      case "total_asc":
        list.sort((a, b) => a.totalSalary - b.totalSalary);
        break;
      case "days_desc":
        list.sort((a, b) => b.attendanceDays - a.attendanceDays);
        break;
      case "ded_desc":
        list.sort((a, b) => b.deductionTotal - a.deductionTotal);
        break;
      default:
        list.sort((a, b) => b.totalSalary - a.totalSalary);
    }
    return list;
  }, [salaries, search, sortBy]);

  const totalSalary = salaries.reduce((sum, s) => sum + s.totalSalary, 0);
  const totalExcludingSubsidy = salaries.reduce((sum, s) => sum + s.totalSalaryExcludingSubsidy, 0);
  const fuelTotal = salaries.reduce((sum, s) => sum + s.fuelAllowance, 0);
  const parkingTotal = salaries.reduce((sum, s) => sum + s.parkingFeeAllowance, 0);
  const dedTotal = salaries.reduce((sum, s) => sum + s.deductionTotal, 0);
  const employeesWithDeductions = salaries.filter((s) => s.deductions.length > 0).length;

  const aggregateComposition = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const k of COMPOSITION_KEYS) agg[k] = 0;
    for (const s of salaries) {
      const comp = compositionOf(s);
      for (const k of COMPOSITION_KEYS) agg[k] += comp[k];
    }
    return agg as Record<(typeof COMPOSITION_KEYS)[number], number>;
  }, [salaries]);
  const donutSlices: DonutSlice[] = COMPOSITION_KEYS.filter((k) => aggregateComposition[k] > 0).map((k) => ({
    key: k,
    label: COMPOSITION_META[k].label,
    value: aggregateComposition[k],
    color: COMPOSITION_META[k].color,
  }));

  const drawerSalary = salaries.find((s) => s.userId === drawerUserId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {!embedded && <h1 className="text-xl font-semibold text-gray-800">薪資計算</h1>}
          <p className="mt-0.5 text-xs text-gray-400">依職等公式即時計算每位員工薪資，可搜尋、排序、批次匯出</p>
        </div>
        <YearMonthPicker year={year} month={month} onChange={(y, m) => setYearMonth({ year: y, month: m })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {locked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            <Lock className="h-3 w-3" />
            已封存
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
            <Unlock className="h-3 w-3" />
            未封存
          </span>
        )}
        {locked && lockStatus && (
          <span className="text-xs text-gray-400">
            {lockStatus.lockedAt ? formatDateTime(lockStatus.lockedAt) : ""}
            {lockStatus.lockedByName ? ` · ${lockStatus.lockedByName} 封存` : ""}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleExportAll}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Download className="h-3.5 w-3.5" />
          匯出 Excel
        </button>
        {isAdmin &&
          (locked ? (
            <button
              type="button"
              disabled={lockBusy}
              onClick={() => setConfirmAction("unlock")}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              <Unlock className="h-3.5 w-3.5" />
              解除封存
            </button>
          ) : (
            <button
              type="button"
              disabled={lockBusy || loading}
              onClick={() => setConfirmAction("lock")}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Lock className="h-3.5 w-3.5" />
              封存本月薪資
            </button>
          ))}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-gray-500">載入中...</p>}

      {!loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="總薪資合計" value={`$${Math.round(totalSalary).toLocaleString()}`} foot={`已計算 ${salaries.length} 位員工`} />
            <StatTile
              label="平均薪資"
              value={`$${Math.round(totalSalary / Math.max(salaries.length, 1)).toLocaleString()}`}
              foot="每人平均實領"
            />
            <StatTile
              label="扣款總額"
              value={dedTotal > 0 ? `-$${Math.round(dedTotal).toLocaleString()}` : "$0"}
              foot={`${employeesWithDeductions} 位有扣款紀錄`}
              tone="danger"
            />
            <StatTile label="已計算人數" value={String(salaries.length)} foot="全職等在職人員" />
          </div>

          {donutSlices.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800">整體薪資組成</h3>
              <p className="mt-0.5 text-xs text-gray-400">全部員工加總後的收入結構（扣款於統計卡單獨列出，不併入圓餅）</p>
              <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
                <DonutChart
                  slices={donutSlices}
                  centerLabel="薪資總額（未扣款前）"
                  formatValue={(v) => `$${Math.round(v).toLocaleString()}`}
                />
                <DonutLegend slices={donutSlices} formatValue={(v) => `$${Math.round(v).toLocaleString()}`} />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋姓名"
                  className="rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="total_desc">總薪資：高至低</option>
                <option value="total_asc">總薪資：低至高</option>
                <option value="days_desc">出勤天數：多至少</option>
                <option value="ded_desc">扣款金額：高至低</option>
              </select>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-3 border-b border-gray-100 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
                已選 {selected.size} 位員工
                <div className="flex-1" />
                <button
                  type="button"
                  disabled={batchBusy}
                  onClick={handleBatchExport}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-100 disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" />
                  {batchBusy ? "匯出中..." : "批次匯出薪資單 PDF"}
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="w-8 px-3 py-2"></th>
                    <th className="px-2 py-2">員工</th>
                    <th className="px-2 py-2">出勤天數</th>
                    <th className="px-2 py-2">件數</th>
                    <th className="px-2 py-2">薪資組成</th>
                    <th className="px-2 py-2">扣款</th>
                    <th className="px-2 py-2">總薪資</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((s) => (
                    <tr key={s.userId} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => openDrawer(s.userId)}>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(s.userId)}
                          onChange={() => toggleSelect(s.userId)}
                          className="h-4 w-4 accent-blue-600"
                        />
                      </td>
                      <td className="px-2 py-2 font-medium text-gray-800">{s.userName}</td>
                      <td className="px-2 py-2 font-mono">{s.attendanceDays} 天</td>
                      <td className="px-2 py-2">
                        <span className="font-mono">{s.totalDeliveryCount.toLocaleString()} 件</span>
                        <span className="ml-1 block text-[11px] text-gray-400">日均 {s.averageDailyCount.toFixed(1)}</span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="w-28">
                          <CompositionBar composition={compositionOf(s)} height={8} />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {s.deductionTotal > 0 ? (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
                            ${s.deductionTotal.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono text-[15px] font-bold text-gray-800">
                        ${Math.round(s.totalSalary).toLocaleString()}
                      </td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDrawer(s.userId, "deductions")}
                            className={`rounded-md px-2 py-1 text-xs font-medium ${
                              s.deductionTotal > 0
                                ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                : "text-gray-500 hover:bg-gray-100"
                            }`}
                          >
                            扣款
                          </button>
                          <button
                            type="button"
                            onClick={() => openDrawer(s.userId)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                          >
                            明細
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-3 py-2" colSpan={6}>
                      當月薪資總支出（油資 {fuelTotal > 0 ? `+$${fuelTotal.toLocaleString()}` : "-"} ／停車費{" "}
                      {parkingTotal > 0 ? `+$${parkingTotal.toLocaleString()}` : "-"} ／未含補貼 $
                      {Math.round(totalExcludingSubsidy).toLocaleString()}）
                    </td>
                    <td className="px-2 py-2 font-mono">${Math.round(totalSalary).toLocaleString()}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={confirmAction === "lock"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleLock}
        busy={lockBusy}
        title={`封存 ${year} 年 ${month} 月薪資？`}
        message="封存後此月金額將凍結為目前計算結果，不再受日後資料補登或公式調整影響。若仍有補登需求可日後解除封存再重封。"
        confirmLabel="確定封存"
      />
      <ConfirmModal
        open={confirmAction === "unlock"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleUnlock}
        busy={lockBusy}
        danger
        title="解除封存本月薪資？"
        message="解除後將恢復即時計算，金額會再次隨每日紀錄或公式調整變動。請於補登或修正完成後重新封存。"
        confirmLabel="確定解除"
      />

      <Drawer
        open={!!drawerSalary}
        onClose={closeDrawer}
        widthClass="max-w-xl"
        title={
          drawerSalary && (
            <div>
              <h2 className="text-base font-semibold text-gray-800">{drawerSalary.userName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {year}年{month}月
                </span>
                {locked ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                    <Lock className="h-3 w-3" />
                    已封存
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
                    <Unlock className="h-3 w-3" />
                    未封存
                  </span>
                )}
              </div>
            </div>
          )
        }
        footer={
          drawerSalary && (
            <button
              type="button"
              onClick={() => handleExportEmployee(drawerSalary.userId, drawerSalary.userName)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Download className="h-3.5 w-3.5" />
              匯出薪資單 PDF
            </button>
          )
        }
      >
        {drawerSalary && (
          <div className="space-y-4">
            <div className="flex gap-1 border-b border-gray-200">
              {(["overview", "daily", "deductions"] as DrawerTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDrawerTab(tab)}
                  className={`px-3 py-2 text-xs font-semibold ${
                    drawerTab === tab
                      ? "border-b-2 border-blue-600 text-blue-700"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {tab === "overview" ? "總覽" : tab === "daily" ? "每日明細" : "扣款事項"}
                  {tab === "deductions" && drawerSalary.deductionTotal > 0 && (
                    <span className="ml-1 text-red-500">({drawerSalary.deductions.length})</span>
                  )}
                </button>
              ))}
            </div>

            {locked && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                此月份已封存，金額已凍結，暫不可新增每日紀錄或扣款；請先解除封存再調整。
              </div>
            )}

            {drawerTab === "overview" && <OverviewTab s={drawerSalary} />}
            {drawerTab === "daily" && (
              <DailyTab
                s={drawerSalary}
                locked={locked}
                canEditRole={canEditRole}
                isAdmin={isAdmin}
                year={year}
                month={month}
                editingDaily={editingDaily}
                editForward={editForward}
                editReverse={editReverse}
                savingDaily={savingDaily}
                savingRoleKey={savingRoleKey}
                addingDaily={addingDaily}
                addDate={addDate}
                addForward={addForward}
                addReverse={addReverse}
                savingAdd={savingAdd}
                onStartEditDaily={startEditDaily}
                onSetEditForward={setEditForward}
                onSetEditReverse={setEditReverse}
                onSaveDaily={handleSaveDaily}
                onCancelEditDaily={() => setEditingDaily(null)}
                onDeleteDaily={handleDeleteDaily}
                onRoleChange={handleRoleChange}
                onStartAddDaily={startAddDaily}
                onSetAddDate={setAddDate}
                onSetAddForward={setAddForward}
                onSetAddReverse={setAddReverse}
                onSaveAddDaily={handleSaveAddDaily}
                onCancelAddDaily={() => setAddingDaily(false)}
              />
            )}
            {drawerTab === "deductions" && (
              <DeductionsPanel
                userId={drawerSalary.userId}
                year={year}
                month={month}
                locked={locked}
                deductions={drawerSalary.deductions}
                dedTotal={drawerSalary.deductionTotal}
                onChanged={load}
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function StatTile({
  label,
  value,
  foot,
  tone,
}: {
  label: string;
  value: string;
  foot: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
      <p className="text-[11px] font-semibold text-gray-400">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${tone === "danger" ? "text-red-600" : "text-gray-800"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-400">{foot}</p>
    </div>
  );
}

function OverviewTab({ s }: { s: EmployeeMonthlySalary }) {
  const comp = compositionOf(s);
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-gray-400">
          <span>薪資組成</span>
          <span className="font-mono text-gray-600">
            ${Math.round(COMPOSITION_KEYS.reduce((sum, k) => sum + comp[k], 0)).toLocaleString()}
          </span>
        </div>
        <CompositionBar composition={comp} />
        <CompositionLegendRows composition={comp} />
        <div className="mt-2 flex justify-between border-t border-dashed border-gray-200 pt-2 text-xs">
          <span className="text-gray-500">本月扣款</span>
          <span className="font-mono font-semibold text-red-600">
            {s.deductionTotal > 0 ? `-$${s.deductionTotal.toLocaleString()}` : "$0"}
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between border-t border-gray-200 pt-2">
          <span className="text-sm font-bold text-gray-800">實領總薪資</span>
          <span className="font-mono text-lg font-extrabold text-gray-800">
            ${Math.round(s.totalSalary).toLocaleString()}
          </span>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">單價建構過程</p>
        {s.rateBreakdown && s.rateBreakdown.length > 0 ? (
          <>
            <RateWaterfall steps={s.rateBreakdown} rate={s.pieceRate} />
            <p className="mt-2 text-[11px] text-gray-400">
              按件薪資 = 單價 ${s.pieceRate.toFixed(1)} × 總件數 {s.totalDeliveryCount.toLocaleString()} 件 = $
              {Math.round(s.pieceWorkTotal).toLocaleString()}
            </p>
          </>
        ) : (
          <p className="rounded-md bg-gray-50 p-2.5 text-xs text-gray-500">{s.formulaNotes || "（此紀錄無單價建構明細，可能為較舊的封存快照）"}</p>
        )}
      </div>

      {s.incentiveBonus > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">激勵獎金</p>
          <p className="text-xs text-gray-600">
            出勤 {s.attendanceDays} 天、日均 {s.averageDailyCount.toFixed(1)} 件，達成激勵條件，發放{" "}
            <span className="font-mono font-bold text-green-600">${s.incentiveBonus.toLocaleString()}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function DailyTab({
  s,
  locked,
  canEditRole,
  isAdmin,
  year,
  month,
  editingDaily,
  editForward,
  editReverse,
  savingDaily,
  savingRoleKey,
  addingDaily,
  addDate,
  addForward,
  addReverse,
  savingAdd,
  onStartEditDaily,
  onSetEditForward,
  onSetEditReverse,
  onSaveDaily,
  onCancelEditDaily,
  onDeleteDaily,
  onRoleChange,
  onStartAddDaily,
  onSetAddDate,
  onSetAddForward,
  onSetAddReverse,
  onSaveAddDaily,
  onCancelAddDaily,
}: {
  s: EmployeeMonthlySalary;
  locked: boolean;
  canEditRole: boolean;
  isAdmin: boolean;
  year: number;
  month: number;
  editingDaily: string | null;
  editForward: number;
  editReverse: number;
  savingDaily: boolean;
  savingRoleKey: string | null;
  addingDaily: boolean;
  addDate: string;
  addForward: number;
  addReverse: number;
  savingAdd: boolean;
  onStartEditDaily: (userId: string, d: DailySalaryDetail) => void;
  onSetEditForward: (n: number) => void;
  onSetEditReverse: (n: number) => void;
  onSaveDaily: (userId: string, date: string) => void;
  onCancelEditDaily: () => void;
  onDeleteDaily: (userId: string, date: string) => void;
  onRoleChange: (userId: string, date: string, role: DailyRoleType) => void;
  onStartAddDaily: () => void;
  onSetAddDate: (v: string) => void;
  onSetAddForward: (n: number) => void;
  onSetAddReverse: (n: number) => void;
  onSaveAddDaily: (userId: string) => void;
  onCancelAddDaily: () => void;
}) {
  const range = monthDateRange(year, month);
  const allowanceItems = [
    ...s.fuelAllowanceItems.map((f) => ({ ...f, kind: "油資補貼" as const })),
    ...s.parkingFeeAllowanceItems.map((p) => ({ ...p, kind: "停車費補貼" as const })),
  ];

  return (
    <div className="space-y-4">
      {isAdmin && !locked && (
        <div>
          {addingDaily ? (
            <div className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
              <div>
                <label className="mb-1 block text-gray-500">日期</label>
                <input
                  type="date"
                  value={addDate}
                  min={range.start}
                  max={range.end}
                  onChange={(e) => onSetAddDate(e.target.value)}
                  className="rounded border border-gray-300 px-1 py-0.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-gray-500">正物流</label>
                <input
                  type="number"
                  value={addForward}
                  onChange={(e) => onSetAddForward(Number(e.target.value))}
                  className="w-16 rounded border border-gray-300 px-1 py-0.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-gray-500">逆物流</label>
                <input
                  type="number"
                  value={addReverse}
                  onChange={(e) => onSetAddReverse(Number(e.target.value))}
                  className="w-16 rounded border border-gray-300 px-1 py-0.5"
                />
              </div>
              <button
                type="button"
                disabled={savingAdd}
                onClick={() => onSaveAddDaily(s.userId)}
                className="text-blue-600 hover:underline disabled:opacity-60"
              >
                {savingAdd ? "儲存中..." : "儲存"}
              </button>
              <button type="button" onClick={onCancelAddDaily} className="text-gray-500 hover:underline">
                取消
              </button>
            </div>
          ) : (
            <button type="button" onClick={onStartAddDaily} className="text-xs text-blue-600 hover:underline">
              + 新增送件記錄
            </button>
          )}
        </div>
      )}

      {s.dailyDetails.length === 0 ? (
        <p className="text-sm text-gray-500">本月尚無送件紀錄</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="px-2 py-1.5">日期</th>
                <th className="px-2 py-1.5">今日角色</th>
                <th className="px-2 py-1.5">正物流</th>
                <th className="px-2 py-1.5">逆物流</th>
                <th className="px-2 py-1.5">小計</th>
                {isAdmin && !locked && <th className="px-2 py-1.5"></th>}
              </tr>
            </thead>
            <tbody>
              {s.dailyDetails.map((d) => {
                const key = `${s.userId}_${d.date}`;
                const isEditing = editingDaily === key;
                return (
                  <tr key={d.date} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">{d.date}</td>
                    <td className="px-2 py-1.5">
                      {canEditRole && !locked ? (
                        <select
                          value={d.role}
                          disabled={savingRoleKey === key}
                          onChange={(e) => onRoleChange(s.userId, d.date, e.target.value as DailyRoleType)}
                          className="rounded border border-gray-300 px-1 py-0.5"
                        >
                          <option value="NONE">無</option>
                          <option value="TRUCK_DRIVER">貨車司機</option>
                          <option value="TRUCK_ATTENDANT">貨車隨車人員</option>
                        </select>
                      ) : (
                        roleLabels[d.role]
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForward}
                          onChange={(e) => onSetEditForward(Number(e.target.value))}
                          className="w-14 rounded border border-gray-300 px-1 py-0.5"
                        />
                      ) : (
                        d.forwardCount
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editReverse}
                          onChange={(e) => onSetEditReverse(Number(e.target.value))}
                          className="w-14 rounded border border-gray-300 px-1 py-0.5"
                        />
                      ) : (
                        d.reverseCount
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{d.subtotal.toLocaleString()}</td>
                    {isAdmin && !locked && (
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <span className="space-x-2">
                            <button
                              type="button"
                              disabled={savingDaily}
                              onClick={() => onSaveDaily(s.userId, d.date)}
                              className="text-blue-600 hover:underline disabled:opacity-60"
                            >
                              儲存
                            </button>
                            <button type="button" onClick={onCancelEditDaily} className="text-gray-500 hover:underline">
                              取消
                            </button>
                          </span>
                        ) : (
                          <span className="space-x-2">
                            <button
                              type="button"
                              onClick={() => onStartEditDaily(s.userId, d)}
                              className="text-blue-600 hover:underline"
                            >
                              編輯
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteDaily(s.userId, d.date)}
                              className="text-red-600 hover:underline"
                            >
                              刪除
                            </button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">油資／停車費補貼</p>
        {allowanceItems.length === 0 ? (
          <p className="rounded-md bg-gray-50 py-3 text-center text-xs text-gray-400">本月無油資／停車費補貼申請</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {allowanceItems.map((item) => (
              <div
                key={`${item.kind}_${item.id}`}
                className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs"
              >
                <span className="text-gray-700">
                  {item.kind} · {item.date}
                  {item.note ? `（${item.note}）` : ""}
                </span>
                <span className="font-mono font-bold text-green-700">+${item.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
