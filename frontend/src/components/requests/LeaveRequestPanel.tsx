import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { LeaveRequest, LeaveType } from "../../api/types";
import { localToday } from "../../utils/date";
import {
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_STYLE,
  LEAVE_TYPE_LABEL,
  LEAVE_TYPE_OPTIONS,
  groupLeaves,
  leaveRangeLabel,
  type LeaveGroup,
} from "../../constants/leave";

const inputClass = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

// 員工請假申請（我的申請的「請假」分頁）：選假別、開始與結束日期，一次請多天
export function LeaveRequestPanel() {
  const [startDate, setStartDate] = useState(localToday());
  const [endDate, setEndDate] = useState(localToday());
  const [type, setType] = useState<LeaveType>("DAY_OFF");
  const [reason, setReason] = useState("");
  const [records, setRecords] = useState<LeaveRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadRecords() {
    try {
      const { data } = await apiClient.get<LeaveRequest[]>("/leaves/my");
      setRecords(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    let active = true;
    apiClient
      .get<LeaveRequest[]>("/leaves/my")
      .then(({ data }) => active && setRecords(data))
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  function pickStart(value: string) {
    setStartDate(value);
    // 結束日期跟著開始日期走，不會比開始早
    if (!endDate || endDate < value) setEndDate(value);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (endDate < startDate) return setError("結束日期不能早於開始日期");
    setSubmitting(true);
    try {
      const { data } = await apiClient.post<{ created: number; skipped: string[] }>("/leaves", {
        startDate,
        endDate,
        type,
        reason: reason || null,
      });
      setMessage(
        `已送出 ${data.created} 天${LEAVE_TYPE_LABEL[type]}申請，等主管核准` +
          (data.skipped.length ? `（${data.skipped.map((d) => d.slice(5).replace("-", "/")).join("、")} 已經請過假，略過）` : "")
      );
      setReason("");
      await loadRecords();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(g: LeaveGroup) {
    if (!window.confirm(g.days > 1 ? `確定要取消這 ${g.days} 天的請假申請嗎？` : "確定要取消這筆請假申請嗎？")) return;
    setError(null);
    try {
      if (g.groupId) await apiClient.delete(`/leaves/group/${g.groupId}`);
      else await apiClient.delete(`/leaves/${g.ids[0]}`);
      await loadRecords();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const groups = groupLeaves(records).sort((a, b) => b.first.localeCompare(a.first));

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-gray-700">假別</span>
          <div role="group" aria-label="假別" className="flex flex-wrap gap-1.5">
            {LEAVE_TYPE_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  type === t ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-blue-400"
                }`}
              >
                {LEAVE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="leave-start" className="mb-1 block text-sm font-medium text-gray-700">開始日期</label>
          <input id="leave-start" type="date" value={startDate} onChange={(e) => pickStart(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="leave-end" className="mb-1 block text-sm font-medium text-gray-700">結束日期（只請一天就跟開始同一天）</label>
          <input id="leave-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="leave-reason" className="mb-1 block text-sm font-medium text-gray-700">原因（選填）</label>
          <textarea
            id="leave-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className={inputClass}
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
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">我的請假紀錄</h2>
        {!loaded ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {groups.map((g) => (
              <li key={g.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-[7rem] font-medium text-gray-800">{leaveRangeLabel(g)}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{g.type ? LEAVE_TYPE_LABEL[g.type] : "其他"}</span>
                <span className="min-w-0 flex-1 text-gray-500">{g.reason ?? ""}</span>
                <span className={`rounded px-2 py-1 text-xs ${LEAVE_STATUS_STYLE[g.status]}`}>{LEAVE_STATUS_LABEL[g.status]}</span>
                {g.status === "PENDING" && (
                  <button type="button" onClick={() => handleCancel(g)} className="text-xs text-red-600 hover:underline">
                    取消申請
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
