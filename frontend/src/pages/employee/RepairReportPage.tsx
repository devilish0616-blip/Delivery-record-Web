import { useEffect, useState } from "react";
import { CheckCircle, Clock, Trash2, Wrench, XCircle } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { RepairRequest, RepairRequestStatus, VehicleType } from "../../api/types";

interface VehicleOption {
  id: string;
  plateNumber: string;
  type: VehicleType;
}

const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  MOTORCYCLE: "機車",
  TRUCK: "貨車",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("zh-TW");
}

const statusConfig: Record<RepairRequestStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: "待處理", color: "bg-amber-100 text-amber-700", icon: <Clock className="h-3.5 w-3.5" /> },
  IN_PROGRESS: { label: "處理中", color: "bg-blue-100 text-blue-700", icon: <Wrench className="h-3.5 w-3.5" /> },
  DONE: { label: "已完成", color: "bg-green-100 text-green-700", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  CANCELLED: { label: "已取消", color: "bg-gray-100 text-gray-500", icon: <XCircle className="h-3.5 w-3.5" /> },
};

export function RepairReportPage() {
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [reports, setReports] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<VehicleOption[]>("/vehicles").then(({ data }) => setVehicles(data)).catch(() => {});
  }, []);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<RepairRequest[]>("/repair-requests/my");
      setReports(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!vehicleId) { setFormError("請選擇車輛"); return; }
    if (!description.trim()) { setFormError("請描述車輛異常狀況"); return; }
    setSubmitting(true);
    try {
      await apiClient.post("/repair-requests", { vehicleId, description: description.trim() });
      setVehicleId("");
      setDescription("");
      await loadReports();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.delete(`/repair-requests/${id}`);
      setConfirmDeleteId(null);
      await loadReports();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Wrench className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-gray-800">車輛故障報修</h1>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">回報車輛異常</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">車輛</label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:max-w-xs"
            >
              <option value="">請選擇車輛</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {VEHICLE_TYPE_LABELS[v.type]} {v.plateNumber}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">異常描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="例：煞車有異音、儀表板燈號亮起、輪胎漏氣..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "送出中..." : "送出報修"}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-800">我的報修紀錄</h2>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">載入中...</p>
          ) : reports.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">尚無報修紀錄</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {reports.map((r) => {
                const st = statusConfig[r.status];
                return (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.vehicle && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            {VEHICLE_TYPE_LABELS[r.vehicle.type]} {r.vehicle.plateNumber}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{formatDate(r.createdAt)}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>
                          {st.icon}
                          {st.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{r.description}</p>
                      {r.resolveNote && <p className="text-xs text-gray-500">處理說明：{r.resolveNote}</p>}
                    </div>
                    {r.status === "PENDING" && (
                      <div className="flex-shrink-0">
                        {confirmDeleteId === r.id ? (
                          <div className="flex items-center gap-2 text-xs">
                            <button onClick={() => handleDelete(r.id)} className="text-red-600 hover:underline">
                              確認撤回
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-gray-400">
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(r.id)}
                            className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
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
