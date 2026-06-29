import { useEffect, useState } from "react";
import { CheckCircle, Clock, Wrench, XCircle } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { RepairRequest, RepairRequestStatus, VehicleType } from "../../api/types";

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

type Filter = "OPEN" | RepairRequestStatus;

export function RepairReviewPage() {
  const [reports, setReports] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("OPEN");

  // 完成 modal
  const [doneTarget, setDoneTarget] = useState<RepairRequest | null>(null);
  const [writeLog, setWriteLog] = useState(true);
  const [logItem, setLogItem] = useState("");
  const [logCost, setLogCost] = useState("");
  const [logMileage, setLogMileage] = useState("");
  const [logVendor, setLogVendor] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<RepairRequest[]>("/repair-requests");
      setReports(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(r: RepairRequest, status: RepairRequestStatus, note?: string) {
    setError(null);
    try {
      await apiClient.put(`/repair-requests/${r.id}`, { status, resolveNote: note ?? null });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function openDone(r: RepairRequest) {
    setDoneTarget(r);
    setWriteLog(true);
    setLogItem(r.description.slice(0, 30));
    setLogCost("");
    setLogMileage("");
    setLogVendor("");
    setResolveNote("");
  }

  async function submitDone() {
    if (!doneTarget) return;
    if (writeLog && !logItem.trim()) {
      setError("請填寫維修項目，或取消「寫入維修履歷」");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.put(`/repair-requests/${doneTarget.id}`, {
        status: "DONE",
        resolveNote: resolveNote.trim() || null,
        log: writeLog
          ? {
              itemName: logItem.trim(),
              cost: logCost ? Number(logCost) : undefined,
              mileage: logMileage ? Number(logMileage) : undefined,
              vendor: logVendor.trim() || null,
            }
          : undefined,
      });
      setDoneTarget(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const filtered = reports.filter((r) =>
    filter === "OPEN" ? r.status === "PENDING" || r.status === "IN_PROGRESS" : r.status === filter
  );
  const openCount = reports.filter((r) => r.status === "PENDING" || r.status === "IN_PROGRESS").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Wrench className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-gray-800">維修報修管理</h1>
        {openCount > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {openCount} 筆待處理
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {([
          ["OPEN", "待處理／處理中"],
          ["DONE", "已完成"],
          ["CANCELLED", "已取消"],
        ] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 ${
              filter === key ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-4 text-sm text-gray-500">載入中...</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">沒有符合條件的報修紀錄</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((r) => {
              const st = statusConfig[r.status];
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.vehicle && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        {VEHICLE_TYPE_LABELS[r.vehicle.type]} {r.vehicle.plateNumber}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>
                      {st.icon}
                      {st.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {r.reportedBy?.name} 回報於 {formatDate(r.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{r.description}</p>
                  {r.resolveNote && <p className="mt-0.5 text-xs text-gray-500">處理說明：{r.resolveNote}</p>}
                  {r.handledBy && r.status !== "PENDING" && (
                    <p className="text-xs text-gray-400">
                      處理人：{r.handledBy.name}
                      {r.handledAt ? `・${formatDate(r.handledAt)}` : ""}
                    </p>
                  )}

                  {(r.status === "PENDING" || r.status === "IN_PROGRESS") && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {r.status === "PENDING" && (
                        <button
                          onClick={() => setStatus(r, "IN_PROGRESS")}
                          className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700 hover:bg-blue-100"
                        >
                          開始處理
                        </button>
                      )}
                      <button
                        onClick={() => openDone(r)}
                        className="rounded border border-green-200 bg-green-50 px-2.5 py-1 font-medium text-green-700 hover:bg-green-100"
                      >
                        標記完成
                      </button>
                      <button
                        onClick={() => {
                          const note = window.prompt("取消原因（選填）") ?? "";
                          setStatus(r, "CANCELLED", note || null ? note : undefined);
                        }}
                        className="rounded border border-gray-200 px-2.5 py-1 text-gray-500 hover:bg-gray-50"
                      >
                        取消報修
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {doneTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-800">
              標記完成 - {doneTarget.vehicle?.plateNumber}
            </h3>
            <p className="mt-1 text-xs text-gray-500">{doneTarget.description}</p>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <label className="mb-1 block font-medium text-gray-700">處理說明（選填）</label>
                <input value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={writeLog} onChange={(e) => setWriteLog(e.target.checked)} />
                同時寫入此車輛的維修保養履歷
              </label>
              {writeLog && (
                <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">維修項目</label>
                    <input value={logItem} onChange={(e) => setLogItem(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">費用</label>
                      <input type="number" value={logCost} onChange={(e) => setLogCost(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">里程</label>
                      <input type="number" value={logMileage} onChange={(e) => setLogMileage(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">廠商／技師</label>
                    <input value={logVendor} onChange={(e) => setLogVendor(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDoneTarget(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                取消
              </button>
              <button onClick={submitDone} disabled={busy} className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-60">
                {busy ? "送出中..." : "確認完成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
