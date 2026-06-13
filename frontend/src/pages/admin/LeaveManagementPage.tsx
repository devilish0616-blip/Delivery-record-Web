import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { LeaveRequest, LeaveStatus } from "../../api/types";

const statusLabels: Record<LeaveStatus, string> = {
  PENDING: "待審核",
  APPROVED: "已核准",
  REJECTED: "已拒絕",
};

const statusStyles: Record<LeaveStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-gray-100 text-gray-500",
};

const filterOptions: { value: LeaveStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "PENDING", label: "待審核" },
  { value: "APPROVED", label: "已核准" },
  { value: "REJECTED", label: "已拒絕" },
];

export function LeaveManagementPage() {
  const [records, setRecords] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeaveStatus | "ALL">("PENDING");
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<LeaveRequest[]>("/leaves");
      setRecords(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleApprove(id: string) {
    setError(null);
    setActingId(id);
    try {
      await apiClient.patch(`/leaves/${id}/approve`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(id: string) {
    setError(null);
    setActingId(id);
    try {
      await apiClient.patch(`/leaves/${id}/reject`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  const filtered = filter === "ALL" ? records : records.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">請假管理</h1>
        <div className="flex gap-2">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                filter === opt.value
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-300 text-gray-700 hover:bg-gray-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">員工</th>
                  <th className="px-4 py-2">日期</th>
                  <th className="px-4 py-2">原因</th>
                  <th className="px-4 py-2">狀態</th>
                  <th className="px-4 py-2">審核人</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{r.user?.name ?? "-"}</td>
                    <td className="px-4 py-2">{r.date.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-gray-500">{r.reason ?? "-"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-1 text-xs ${statusStyles[r.status]}`}>
                        {statusLabels[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{r.reviewerName ?? "-"}</td>
                    <td className="px-4 py-2">
                      {r.status === "PENDING" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actingId === r.id}
                            onClick={() => handleApprove(r.id)}
                            className="rounded-md border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-60"
                          >
                            核准
                          </button>
                          <button
                            type="button"
                            disabled={actingId === r.id}
                            onClick={() => handleReject(r.id)}
                            className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            拒絕
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
