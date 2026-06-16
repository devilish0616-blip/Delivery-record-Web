import { useEffect, useState } from "react";
import { CheckCircle, Clock, Fuel, Trash2, XCircle } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { FuelReport, User } from "../../api/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: {
    label: "待審核",
    color: "bg-amber-100 text-amber-700",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  APPROVED: {
    label: "已核准",
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle className="h-3.5 w-3.5" />,
  },
  REJECTED: {
    label: "已駁回",
    color: "bg-red-100 text-red-700",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

function RejectModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!reason.trim()) { setError("請填寫駁回原因"); return; }
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
        <h3 className="mb-3 text-base font-semibold text-gray-800">駁回加油回報</h3>
        <label className="mb-1 block text-sm font-medium text-gray-700">駁回原因</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="請輸入駁回原因..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          autoFocus
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-60"
          >
            {submitting ? "送出中..." : "確認駁回"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface VehicleStat {
  vehicleId: string;
  plateNumber: string;
  total: number;
  count: number;
}

function buildVehicleStats(reports: FuelReport[]): VehicleStat[] {
  const map = new Map<string, VehicleStat>();
  for (const r of reports) {
    if (!r.vehicle) continue;
    const key = r.vehicle.id;
    const existing = map.get(key);
    if (existing) {
      existing.total += r.amount;
      existing.count += 1;
    } else {
      map.set(key, { vehicleId: key, plateNumber: r.vehicle.plateNumber, total: r.amount, count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export function FuelReviewPage() {
  const { user } = useAuth();
  const now = new Date();
  const canDelete = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "REGION_MANAGER";

  // 篩選器
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [filterEmployeeId, setFilterEmployeeId] = useState("");

  const [reports, setReports] = useState<FuelReport[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 操作狀態
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {};
      if (tab === "pending") {
        params.status = "PENDING";
      } else {
        params.year = year;
        params.month = month;
        if (filterEmployeeId) params.employeeId = filterEmployeeId;
      }
      const { data } = await apiClient.get<FuelReport[]>("/fuel-reports", { params });
      setReports(data);
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
  }, [tab, year, month, filterEmployeeId]);

  async function handleApprove(id: string) {
    setApprovingId(id);
    try {
      await apiClient.put(`/fuel-reports/${id}/approve`);
      await loadReports();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(id: string, reason: string) {
    await apiClient.put(`/fuel-reports/${id}/reject`, { rejectReason: reason });
    setRejectTargetId(null);
    await loadReports();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await apiClient.delete(`/fuel-reports/${id}`);
      setConfirmDeleteId(null);
      await loadReports();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  function goToMonth(y: number, m: number) {
    if (m < 1) { setYear(y - 1); setMonth(12); }
    else if (m > 12) { setYear(y + 1); setMonth(1); }
    else { setYear(y); setMonth(m); }
  }

  const totalApproved = tab === "history"
    ? reports.filter((r) => r.status === "APPROVED").reduce((sum, r) => sum + r.amount, 0)
    : 0;

  const vehicleStats = tab === "history"
    ? buildVehicleStats(reports.filter((r) => r.status === "APPROVED"))
    : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Fuel className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-gray-800">油資審核</h1>
      </div>

      {/* Tab 切換 */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        <button
          type="button"
          onClick={() => setTab("pending")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "pending"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          待審核
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "history"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          歷史紀錄
        </button>
      </div>

      {/* 歷史紀錄篩選器 */}
      {tab === "history" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => goToMonth(year, month - 1)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >‹</button>
            <span className="flex items-center rounded border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
              {year} 年 {month} 月
            </span>
            <button
              type="button"
              onClick={() => goToMonth(year, month + 1)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >›</button>
          </div>
          {(user?.role === "ADMIN" || user?.role === "MANAGER") && (
            <select
              value={filterEmployeeId}
              onChange={(e) => setFilterEmployeeId(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">所有員工</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          )}
          {totalApproved > 0 && (
            <span className="rounded-md bg-green-50 px-3 py-1.5 text-sm text-green-700">
              已核准合計：<span className="font-semibold">${Math.round(totalApproved).toLocaleString()}</span> 元
            </span>
          )}
        </div>
      )}

      {/* 機車月度油費統計（歷史 tab，有車輛資料時才顯示） */}
      {tab === "history" && vehicleStats.length > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-blue-800">
            {year} 年 {month} 月 機車油費統計（已核准）
          </h2>
          <div className="flex flex-wrap gap-3">
            {vehicleStats.map((vs) => (
              <div
                key={vs.vehicleId}
                className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-gray-800">{vs.plateNumber}</span>
                <span className="mx-1.5 text-gray-400">·</span>
                <span className="font-semibold text-blue-700">
                  ${Math.round(vs.total).toLocaleString()} 元
                </span>
                <span className="ml-1 text-xs text-gray-400">（{vs.count} 筆）</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 列表 */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-4 text-sm text-gray-500">載入中...</p>
        ) : reports.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">
            {tab === "pending" ? "目前沒有待審核的加油回報" : "查無紀錄"}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {reports.map((r) => {
              const st = statusConfig[r.status] ?? statusConfig.PENDING;
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-800">
                          {r.employee?.name ?? "-"}
                        </span>
                        <span className="text-sm text-gray-600">{formatDate(r.date)}</span>
                        {r.vehicle && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            {r.vehicle.plateNumber}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-gray-900">
                          ${Math.round(r.amount).toLocaleString()} 元
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}
                        >
                          {st.icon}
                          {st.label}
                        </span>
                      </div>
                      {r.note && (
                        <p className="text-xs text-gray-500">備註：{r.note}</p>
                      )}
                      {r.status === "REJECTED" && r.rejectReason && (
                        <p className="text-xs text-red-600">駁回原因：{r.rejectReason}</p>
                      )}
                      {r.reviewedBy && r.status !== "PENDING" && (
                        <p className="text-xs text-gray-400">
                          審核者：{r.reviewedBy.name}
                          {r.reviewedAt &&
                            `・${new Date(r.reviewedAt).toLocaleDateString("zh-TW")}`}
                        </p>
                      )}
                    </div>

                    {/* 操作按鈕 */}
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
                      {canDelete && (
                        confirmDeleteId === r.id ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => handleDelete(r.id)}
                              className="text-red-600 hover:underline disabled:opacity-60"
                            >
                              確認刪除
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-gray-400"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(r.id)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                            title="刪除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {rejectTargetId && (
        <RejectModal
          onConfirm={(reason) => handleReject(rejectTargetId, reason)}
          onClose={() => setRejectTargetId(null)}
        />
      )}
    </div>
  );
}
