import { useEffect, useState } from "react";
import { CheckCircle, Clock, Fuel, Trash2, XCircle } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { FuelReport } from "../../api/types";

interface VehicleOption {
  id: string;
  plateNumber: string;
  type: string;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
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

export function FuelReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reports, setReports] = useState<FuelReport[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 表單
  const [formDate, setFormDate] = useState(todayStr());
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formVehicleId, setFormVehicleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 刪除確認
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiClient
      .get<VehicleOption[]>("/vehicles")
      .then(({ data }) => setVehicles(data.filter((v) => v.type === "MOTORCYCLE")))
      .catch(() => {});
  }, []);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<FuelReport[]>("/fuel-reports/my", {
        params: { year, month },
      });
      setReports(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const amt = parseFloat(formAmount);
    if (!formDate) { setFormError("請選擇加油日期"); return; }
    if (isNaN(amt) || amt <= 0) { setFormError("請輸入有效的加油金額"); return; }

    setSubmitting(true);
    try {
      await apiClient.post("/fuel-reports", {
        date: formDate,
        amount: amt,
        note: formNote.trim() || null,
        vehicleId: formVehicleId || null,
      });
      setFormAmount("");
      setFormNote("");
      setFormVehicleId("");
      await loadReports();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
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

  const totalApproved = reports
    .filter((r) => r.status === "APPROVED")
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Fuel className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-gray-800">加油回報</h1>
      </div>

      {/* 新增表單 */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">新增加油回報</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">加油日期</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">金額（元）</label>
              <input
                type="number"
                min="1"
                step="1"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="例：500"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">機車車牌</label>
              <select
                value={formVehicleId}
                onChange={(e) => setFormVehicleId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">請選擇（選填）</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.plateNumber}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">備註（選填）</label>
              <input
                type="text"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="其他說明"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "送出中..." : "送出回報"}
            </button>
          </div>
        </form>
      </div>

      {/* 歷史紀錄 */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-800">
            {year} 年 {month} 月 回報紀錄
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goToMonth(year, month - 1)}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              ‹ 上個月
            </button>
            <button
              type="button"
              onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              本月
            </button>
            <button
              type="button"
              onClick={() => goToMonth(year, month + 1)}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              下個月 ›
            </button>
          </div>
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        {/* 本月核准合計 */}
        {!loading && totalApproved > 0 && (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-4 py-2.5">
            <p className="text-sm text-green-800">
              本月已核准油資補貼合計：
              <span className="ml-1 font-semibold">${Math.round(totalApproved).toLocaleString()}</span>
              元（將計入當月薪資）
            </p>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">載入中...</p>
          ) : reports.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">本月尚無加油回報紀錄</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {reports.map((r) => {
                const st = statusConfig[r.status] ?? statusConfig.PENDING;
                return (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">
                          {formatDate(r.date)}
                        </span>
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

                    {r.status === "PENDING" && (
                      <div className="flex-shrink-0">
                        {confirmDeleteId === r.id ? (
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => handleDelete(r.id)}
                              className="text-red-600 hover:underline disabled:opacity-60"
                            >
                              確認撤回
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
                            className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                            title="撤回回報"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            撤回
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
