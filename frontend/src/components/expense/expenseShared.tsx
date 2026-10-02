import { useState, type ReactNode } from "react";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { getErrorMessage } from "../../api/client";
import { VEHICLE_TYPE_LABELS, formatDate, type ExpenseReport } from "./expenseKinds";

const statusConfig: Record<string, { label: string; color: string; icon: ReactNode }> = {
  PENDING: { label: "待審核", color: "bg-amber-100 text-amber-700", icon: <Clock className="h-3.5 w-3.5" /> },
  APPROVED: { label: "已核准", color: "bg-green-100 text-green-700", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  REJECTED: { label: "已駁回", color: "bg-red-100 text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
};

export function StatusPill({ status }: { status: string }) {
  const st = statusConfig[status] ?? statusConfig.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>
      {st.icon}
      {st.label}
    </span>
  );
}

// 回報列的共用內容（日期、車牌、金額、狀態、備註、駁回原因、審核者），回報頁與審核頁都用這一份
export function ExpenseReportSummary({ report, showEmployee }: { report: ExpenseReport; showEmployee?: boolean }) {
  const r = report;
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {showEmployee && <span className="font-medium text-gray-800">{r.employee?.name ?? "-"}</span>}
        <span className={showEmployee ? "text-sm text-gray-600" : "text-sm font-medium text-gray-800"}>
          {formatDate(r.date)}
        </span>
        {r.vehicle && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            {VEHICLE_TYPE_LABELS[r.vehicle.type]} {r.vehicle.plateNumber}
          </span>
        )}
        <span className="text-sm font-semibold text-gray-900">${Math.round(r.amount).toLocaleString()} 元</span>
        <StatusPill status={r.status} />
      </div>
      {r.enteredBy && <p className="text-xs text-purple-700">由 {r.enteredBy.name} 代填</p>}
      {r.note && <p className="text-xs text-gray-500">備註：{r.note}</p>}
      {r.status === "REJECTED" && r.rejectReason && <p className="text-xs text-red-600">駁回原因：{r.rejectReason}</p>}
      {r.reviewedBy && r.status !== "PENDING" && (
        <p className="text-xs text-gray-400">
          審核者：{r.reviewedBy.name}
          {r.reviewedAt && `・${new Date(r.reviewedAt).toLocaleDateString("zh-TW")}`}
        </p>
      )}
    </div>
  );
}

export function MonthStepper({
  year,
  month,
  onChange,
  showToday,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
  showToday?: boolean;
}) {
  const now = new Date();
  const btn = "rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-100";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="上個月" onClick={() => onChange(year, month - 1)} className={btn}>
        ‹
      </button>
      <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700">
        {year} 年 {month} 月
      </span>
      <button type="button" aria-label="下個月" onClick={() => onChange(year, month + 1)} className={btn}>
        ›
      </button>
      {showToday && (
        <button type="button" onClick={() => onChange(now.getFullYear(), now.getMonth() + 1)} className={btn}>
          本月
        </button>
      )}
    </div>
  );
}

export function RejectModal({
  title,
  onConfirm,
  onClose,
}: {
  title: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!reason.trim()) {
      setError("請填寫駁回原因");
      return;
    }
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
        <h3 className="mb-3 text-base font-semibold text-gray-800">{title}</h3>
        <label htmlFor="reject-reason" className="mb-1 block text-sm font-medium text-gray-700">
          駁回原因
        </label>
        <textarea
          id="reject-reason"
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
