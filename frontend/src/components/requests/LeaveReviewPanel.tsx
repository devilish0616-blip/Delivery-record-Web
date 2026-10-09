import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { LeaveRequest, LeaveStatus } from "../../api/types";
import {
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_STYLE,
  LEAVE_TYPE_LABEL,
  groupLeaves,
  leaveRangeLabel,
  type LeaveGroup,
} from "../../constants/leave";

const filterOptions: { value: LeaveStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "PENDING", label: "待審核" },
  { value: "APPROVED", label: "已核准" },
  { value: "REJECTED", label: "已拒絕" },
];

// 請假審核（審核中心的「請假」分頁）：一次請多天的合成一列，可勾選多筆一起核准或拒絕
export function LeaveReviewPanel({ onChanged }: { onChanged?: () => void }) {
  const [records, setRecords] = useState<LeaveRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeaveStatus | "ALL">("PENDING");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const { data } = await apiClient.get<LeaveRequest[]>("/leaves");
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
      .get<LeaveRequest[]>("/leaves")
      .then(({ data }) => active && setRecords(data))
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  async function review(groups: LeaveGroup[], action: "approve" | "reject") {
    if (groups.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      await apiClient.post("/leaves/review-batch", { ids: groups.flatMap((g) => g.ids), action });
      setPicked(new Set());
      await load();
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const groups = groupLeaves(filter === "ALL" ? records : records.filter((r) => r.status === filter)).sort((a, b) =>
    filter === "PENDING" ? a.first.localeCompare(b.first) : b.first.localeCompare(a.first)
  );
  const pendingGroups = groups.filter((g) => g.status === "PENDING");
  const pickedGroups = pendingGroups.filter((g) => picked.has(g.key));

  function toggle(key: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setFilter(opt.value);
                setPicked(new Set());
              }}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                filter === opt.value ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {pendingGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPicked(pickedGroups.length === pendingGroups.length ? new Set() : new Set(pendingGroups.map((g) => g.key)))}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              {pickedGroups.length === pendingGroups.length ? "全不選" : "全選"}
            </button>
            <button
              type="button"
              disabled={busy || pickedGroups.length === 0}
              onClick={() => review(pickedGroups, "reject")}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              拒絕勾選的
            </button>
            <button
              type="button"
              disabled={busy || pickedGroups.length === 0}
              onClick={() => review(pickedGroups, "approve")}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              核准勾選的 {pickedGroups.length > 0 ? `${pickedGroups.length} 筆` : ""}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {!loaded ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {groups.map((g) => (
              <li key={g.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                {g.status === "PENDING" ? (
                  <input
                    type="checkbox"
                    aria-label={`勾選 ${g.userName} ${leaveRangeLabel(g)}`}
                    checked={picked.has(g.key)}
                    onChange={() => toggle(g.key)}
                    className="h-4 w-4 accent-blue-600"
                  />
                ) : (
                  <span className="w-4" />
                )}
                <span className="min-w-[4.5rem] font-medium text-gray-800">{g.userName}</span>
                <span className="min-w-[7rem] text-gray-700">{leaveRangeLabel(g)}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{g.type ? LEAVE_TYPE_LABEL[g.type] : "其他"}</span>
                <span className="min-w-0 flex-1 text-gray-500">{g.reason ?? ""}</span>
                <span className={`rounded px-2 py-1 text-xs ${LEAVE_STATUS_STYLE[g.status]}`}>{LEAVE_STATUS_LABEL[g.status]}</span>
                {g.reviewerName && g.status !== "PENDING" && <span className="text-xs text-gray-400">{g.reviewerName}</span>}
                {g.status === "PENDING" && (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => review([g], "approve")}
                      className="rounded-md border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-60"
                    >
                      核准
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => review([g], "reject")}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      拒絕
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
