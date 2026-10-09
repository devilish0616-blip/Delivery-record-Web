import { useEffect, useState } from "react";
import { CheckCircle, Trash2, XCircle } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { ExpenseContext, User, VehicleType } from "../../api/types";
import { ExpenseReportSummary, MonthStepper, RejectModal } from "./expenseShared";
import { EXPENSE_KINDS, formatDate, shiftMonth, type ExpenseKind, type ExpenseReport } from "./expenseKinds";

// 審核參考：這個人這個月第幾筆、合計多少；這台車上次加油幾天前；資料檢查標記
function ContextLine({ kind, c }: { kind: ExpenseKind; c: ExpenseContext }) {
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const parts = [`這個月第 ${c.monthCount} 筆，合計 ${money(c.monthTotal)}`];
  if (kind === "fuel" && c.lastDaysAgo !== null) {
    parts.push(c.lastDaysAgo === 0 ? `這台車同一天還有一筆加油（${money(c.lastAmount ?? 0)}）` : `這台車上次加油 ${c.lastDaysAgo} 天前（${money(c.lastAmount ?? 0)}）`);
  }
  return (
    <div className="text-xs">
      <p className="text-gray-400">{parts.join("・")}</p>
      {c.flag && <p className="font-medium text-amber-700">資料檢查：{c.flag}</p>}
    </div>
  );
}

// ─── 依車輛彙整已核准金額 ────────────────────────────────────────────────────

interface VehicleGroup {
  vehicleId: string;
  plateNumber: string;
  total: number;
  reports: ExpenseReport[];
}

function buildVehicleGroups(reports: ExpenseReport[], type: VehicleType): VehicleGroup[] {
  const map = new Map<string, VehicleGroup>();
  for (const r of reports) {
    if (r.vehicle?.type !== type) continue;
    const g = map.get(r.vehicle.id) ?? { vehicleId: r.vehicle.id, plateNumber: r.vehicle.plateNumber, total: 0, reports: [] };
    g.total += r.amount;
    g.reports.push(r);
    map.set(r.vehicle.id, g);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function VehicleGroupSection({
  title,
  short,
  groups,
  expanded,
  setExpanded,
}: {
  title: string;
  short: string;
  groups: VehicleGroup[];
  expanded: string | null;
  setExpanded: (id: string | null) => void;
}) {
  const subtotal = groups.reduce((s, g) => s + g.total, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {subtotal > 0 && (
          <span className="text-sm text-gray-500">
            小計：<span className="font-semibold text-gray-800">${Math.round(subtotal).toLocaleString()}</span> 元
          </span>
        )}
      </div>
      {groups.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
          本月沒有已核准的{title}{short}紀錄
        </div>
      ) : (
        groups.map((g) => {
          const isOpen = expanded === g.vehicleId;
          return (
            <div key={g.vehicleId} className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : g.vehicleId)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded bg-gray-100 px-2.5 py-1 text-sm font-semibold text-gray-700">{g.plateNumber}</span>
                  <span className="text-xs text-gray-400">共 {g.reports.length} 筆</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-800">
                    ${Math.round(g.total).toLocaleString()}
                    <span className="ml-1 text-xs font-normal text-gray-400">元</span>
                  </span>
                  <span className="text-gray-400">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>
              {isOpen && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500">
                        <th className="px-4 py-2 text-left">日期</th>
                        <th className="px-4 py-2 text-left">員工</th>
                        <th className="px-4 py-2 text-left">備註</th>
                        <th className="px-4 py-2 text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {g.reports.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2 text-gray-600">{formatDate(r.date)}</td>
                          <td className="px-4 py-2 text-gray-700">{r.employee?.name ?? "-"}</td>
                          <td className="px-4 py-2 text-gray-400">{r.note ?? "-"}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-800">${Math.round(r.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50 text-sm font-semibold">
                        <td colSpan={3} className="px-4 py-2 text-gray-600">小計</td>
                        <td className="px-4 py-2 text-right text-gray-800">${Math.round(g.total).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function VehicleStats({ kind, year, month }: { kind: ExpenseKind; year: number; month: number }) {
  const cfg = EXPENSE_KINDS[kind];
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<ExpenseReport[]>(cfg.api, { params: { year, month, status: "APPROVED" } })
      .then(({ data }) => setReports(data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [cfg.api, year, month]);

  const motoGroups = buildVehicleGroups(reports, "MOTORCYCLE");
  const truckGroups = buildVehicleGroups(reports, "TRUCK");

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (loading) return <p className="text-sm text-gray-400">載入中...</p>;
  if (motoGroups.length === 0 && truckGroups.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
        本月沒有已核准且有綁定車牌的{cfg.short}紀錄
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <VehicleGroupSection title="機車" short={cfg.short} groups={motoGroups} expanded={expanded} setExpanded={setExpanded} />
      <VehicleGroupSection title="貨車" short={cfg.short} groups={truckGroups} expanded={expanded} setExpanded={setExpanded} />
    </div>
  );
}

// ─── 審核面板（審核中心的油資、停車費分頁）──────────────────────────────────

type View = "pending" | "history" | "vehicles";

export function ExpenseReviewPanel({ kind, onChanged }: { kind: ExpenseKind; onChanged?: () => void }) {
  const cfg = EXPENSE_KINDS[kind];
  const now = new Date();
  const [view, setView] = useState<View>("pending");
  const [{ year, month }, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [filterEmployeeId, setFilterEmployeeId] = useState("");

  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [approvingId, setApprovingId] = useState<string | null>(null);
  // 待審核：勾選多筆一次核准、每筆的參考資訊（這個月第幾筆、這台車上次加油幾天前、資料檢查標記）
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [context, setContext] = useState<Record<string, ExpenseContext>>({});
  const [batchBusy, setBatchBusy] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadReports() {
    if (view === "vehicles") return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> =
        view === "pending"
          ? { status: "PENDING" }
          : { year, month, ...(filterEmployeeId ? { employeeId: filterEmployeeId } : {}) };
      const [{ data }, ctx] = await Promise.all([
        apiClient.get<ExpenseReport[]>(cfg.api, { params }),
        view === "pending"
          ? apiClient.get<Record<string, ExpenseContext>>("/review/expense-context", { params: { kind } }).then((r) => r.data)
          : Promise.resolve({}),
      ]);
      setReports(data);
      setContext(ctx);
      setPicked((cur) => new Set([...cur].filter((id) => data.some((r) => r.id === id && r.status === "PENDING"))));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    apiClient.get<User[]>("/employees").then(({ data }) => setEmployees(data.filter((e) => e.isActive)));
  }, []);

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, year, month, filterEmployeeId]);

  async function afterChange() {
    await loadReports();
    onChanged?.();
  }

  async function handleApprove(id: string) {
    setApprovingId(id);
    try {
      const { data } = await apiClient.put<{ carriedTo?: string | null }>(`${cfg.api}/${id}/approve`);
      // 回報日期那個月的薪資已結算時，這筆改計入下個月，提醒審核的人
      setNotice(data.carriedTo ? `這筆的月份薪資已結算，已計入 ${data.carriedTo}薪資（上月補報）` : null);
      await afterChange();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApprovingId(null);
    }
  }

  async function handleBatchApprove() {
    const ids = reports.filter((r) => r.status === "PENDING" && picked.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    setBatchBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post<{ approved: number; carried: { carriedTo: string }[] }>(`${cfg.api}/approve-batch`, { ids });
      setNotice(
        `已核准 ${data.approved} 筆` +
          (data.carried.length
            ? `，其中 ${data.carried.length} 筆的月份薪資已結算，計入 ${[...new Set(data.carried.map((c) => c.carriedTo))].join("、")}薪資（上月補報）`
            : "")
      );
      setPicked(new Set());
      await afterChange();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBatchBusy(false);
    }
  }

  function togglePick(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleReject(id: string, reason: string) {
    await apiClient.put(`${cfg.api}/${id}/reject`, { rejectReason: reason });
    setRejectTargetId(null);
    await afterChange();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await apiClient.delete(`${cfg.api}/${id}`);
      setConfirmDeleteId(null);
      await afterChange();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const totalApproved =
    view === "history" ? reports.filter((r) => r.status === "APPROVED").reduce((sum, r) => sum + r.amount, 0) : 0;

  const views: { key: View; label: string }[] = [
    { key: "pending", label: "待審核" },
    { key: "history", label: "歷史紀錄" },
    { key: "vehicles", label: `各車${cfg.short}` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`rounded px-3 py-1 text-sm ${
                view === v.key ? "bg-white font-medium text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view !== "pending" && <MonthStepper year={year} month={month} onChange={(y, m) => setYm(shiftMonth(y, m))} />}
        {view === "history" && (
          <select
            value={filterEmployeeId}
            onChange={(e) => setFilterEmployeeId(e.target.value)}
            aria-label="篩選員工"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">所有員工</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        )}
        {totalApproved > 0 && (
          <span className="rounded-md bg-green-50 px-3 py-1.5 text-sm text-green-700">
            已核准合計：<span className="font-semibold">${Math.round(totalApproved).toLocaleString()}</span> 元
          </span>
        )}
      </div>

      {view === "vehicles" ? (
        <VehicleStats kind={kind} year={year} month={month} />
      ) : (
        <>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}
          {view === "pending" && reports.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() =>
                  setPicked(picked.size > 0 ? new Set() : new Set(reports.filter((r) => !context[r.id]?.flag).map((r) => r.id)))
                }
                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100"
              >
                {picked.size > 0 ? "全不選" : "全選（有標記的不選）"}
              </button>
              <button
                type="button"
                disabled={batchBusy || picked.size === 0}
                onClick={handleBatchApprove}
                className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {batchBusy ? "處理中..." : `核准勾選的 ${picked.size} 筆`}
              </button>
            </div>
          )}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <p className="p-4 text-sm text-gray-500">載入中...</p>
            ) : reports.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">
                {view === "pending" ? `目前沒有待審核的${cfg.name}` : "查無紀錄"}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {reports.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    {view === "pending" && (
                      <input
                        type="checkbox"
                        aria-label="勾選這筆"
                        checked={picked.has(r.id)}
                        onChange={() => togglePick(r.id)}
                        className="mt-1 h-4 w-4 accent-blue-600"
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <ExpenseReportSummary report={r} showEmployee />
                      {view === "pending" && context[r.id] && <ContextLine kind={kind} c={context[r.id]} />}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {r.status === "PENDING" && (
                        <>
                          <button
                            type="button"
                            disabled={approvingId === r.id}
                            onClick={() => handleApprove(r.id)}
                            className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            {approvingId === r.id ? "處理中..." : "核准"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectTargetId(r.id)}
                            className="flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            駁回
                          </button>
                        </>
                      )}
                      {confirmDeleteId === r.id ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => handleDelete(r.id)}
                            className="text-red-600 hover:underline disabled:opacity-60"
                          >
                            確認刪除
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-gray-400">
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(r.id)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          title="刪除"
                          aria-label="刪除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {rejectTargetId && (
        <RejectModal
          title={`駁回${cfg.name}`}
          onConfirm={(reason) => handleReject(rejectTargetId, reason)}
          onClose={() => setRejectTargetId(null)}
        />
      )}
    </div>
  );
}
