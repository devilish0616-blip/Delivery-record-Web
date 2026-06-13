import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { LeaveRequest, LeaveStatus } from "../../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

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

export function LeaveRequestPage() {
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [records, setRecords] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadRecords() {
    setLoading(true);
    try {
      const { data } = await apiClient.get<LeaveRequest[]>("/leaves/my");
      setRecords(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await apiClient.post("/leaves", { date, reason: reason || null });
      setMessage("已送出請假申請");
      setReason("");
      await loadRecords();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm("確定要取消這筆請假申請嗎？")) return;
    setError(null);
    try {
      await apiClient.delete(`/leaves/${id}`);
      await loadRecords();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">請假申請</h1>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">請假日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div />
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">原因（選填）</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="請假原因..."
          />
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {message && <p className="text-sm text-green-600 sm:col-span-2">{message}</p>}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "送出中..." : "送出申請"}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          我的請假紀錄
        </h2>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : records.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">日期</th>
                  <th className="px-4 py-2">原因</th>
                  <th className="px-4 py-2">狀態</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{r.date.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-gray-500">{r.reason ?? "-"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-1 text-xs ${statusStyles[r.status]}`}>
                        {statusLabels[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {r.status === "PENDING" && (
                        <button
                          type="button"
                          onClick={() => handleCancel(r.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          取消申請
                        </button>
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
