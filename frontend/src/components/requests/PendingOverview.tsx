import { useEffect, useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { LeaveRequest, RepairRequest } from "../../api/types";
import { RejectModal } from "../expense/expenseShared";
import { EXPENSE_KINDS, VEHICLE_TYPE_LABELS, formatDate, type ExpenseKind, type ExpenseReport } from "../expense/expenseKinds";

export interface ReviewSummary {
  fuel: number | null;
  parking: number | null;
  leave: number | null;
  repair: number | null;
}

type Item =
  | { kind: ExpenseKind; at: string; report: ExpenseReport }
  | { kind: "leave"; at: string; leave: LeaveRequest }
  | { kind: "repair"; at: string; repair: RepairRequest };

const KIND_CHIP: Record<Item["kind"], { label: string; className: string }> = {
  fuel: { label: "油資", className: "bg-blue-50 text-blue-700" },
  parking: { label: "停車費", className: "bg-emerald-50 text-emerald-700" },
  leave: { label: "請假", className: "bg-amber-50 text-amber-800" },
  repair: { label: "報修", className: "bg-gray-100 text-gray-700" },
};

// 審核中心「全部待處理」：把使用者有權處理的各類待辦依送出時間排成一張清單，
// 油資／停車費／請假可直接核准或駁回，報修需填處理內容，按「前往處理」切到報修分頁
export function PendingOverview({
  summary,
  onChanged,
  goTab,
}: {
  summary: ReviewSummary;
  onChanged: () => void;
  goTab: (key: string) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ kind: ExpenseKind; id: string } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [fuel, parking, leaves, repairs] = await Promise.all([
        summary.fuel !== null
          ? apiClient.get<ExpenseReport[]>(EXPENSE_KINDS.fuel.api, { params: { status: "PENDING" } }).then((r) => r.data)
          : [],
        summary.parking !== null
          ? apiClient.get<ExpenseReport[]>(EXPENSE_KINDS.parking.api, { params: { status: "PENDING" } }).then((r) => r.data)
          : [],
        summary.leave !== null
          ? apiClient.get<LeaveRequest[]>("/leaves", { params: { status: "PENDING" } }).then((r) => r.data)
          : [],
        summary.repair !== null ? apiClient.get<RepairRequest[]>("/repair-requests").then((r) => r.data) : [],
      ]);
      const next: Item[] = [
        ...fuel.map((report) => ({ kind: "fuel" as const, at: report.createdAt, report })),
        ...parking.map((report) => ({ kind: "parking" as const, at: report.createdAt, report })),
        ...leaves.map((leave) => ({ kind: "leave" as const, at: leave.createdAt, leave })),
        ...repairs
          .filter((r) => r.status === "PENDING" || r.status === "IN_PROGRESS")
          .map((repair) => ({ kind: "repair" as const, at: repair.createdAt, repair })),
      ];
      next.sort((a, b) => a.at.localeCompare(b.at));
      setItems(next);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(id: string, run: () => Promise<unknown>) {
    setActingId(id);
    setError(null);
    try {
      await run();
      await load();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">載入中...</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          目前沒有待處理的項目
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const chip = KIND_CHIP[item.kind];
            const id = item.kind === "leave" ? item.leave.id : item.kind === "repair" ? item.repair.id : item.report.id;
            const busy = actingId === id;
            return (
              <li
                key={`${item.kind}-${id}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <span className={`w-14 flex-shrink-0 rounded px-2 py-0.5 text-center text-xs font-semibold ${chip.className}`}>
                  {chip.label}
                </span>
                <div className="min-w-0 flex-1">
                  {item.kind === "leave" ? (
                    <>
                      <p className="text-sm font-medium text-gray-800">
                        {item.leave.user?.name ?? "-"}・{formatDate(item.leave.date)} 請假
                      </p>
                      <p className="text-xs text-gray-500">{item.leave.reason || "未填原因"}</p>
                    </>
                  ) : item.kind === "repair" ? (
                    <>
                      <p className="text-sm font-medium text-gray-800">
                        {item.repair.vehicle
                          ? `${VEHICLE_TYPE_LABELS[item.repair.vehicle.type]} ${item.repair.vehicle.plateNumber}`
                          : "車輛"}
                        ・{item.repair.reportedBy?.name ?? "-"} 回報
                        {item.repair.status === "IN_PROGRESS" && (
                          <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-700">處理中</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-gray-500">{item.repair.description}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-800">
                        {item.report.employee?.name ?? "-"}・
                        <span className="font-semibold">${Math.round(item.report.amount).toLocaleString()}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(item.report.date)}
                        {item.report.vehicle && `・${VEHICLE_TYPE_LABELS[item.report.vehicle.type]} ${item.report.vehicle.plateNumber}`}
                        {item.report.note && `・${item.report.note}`}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  {item.kind === "repair" ? (
                    <button
                      type="button"
                      onClick={() => goTab("repair")}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      前往處理
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          item.kind === "leave"
                            ? act(id, () => apiClient.patch(`/leaves/${id}/reject`))
                            : setRejecting({ kind: item.kind, id })
                        }
                        className="flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {item.kind === "leave" ? "拒絕" : "駁回"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(id, () =>
                            item.kind === "leave"
                              ? apiClient.patch(`/leaves/${id}/approve`)
                              : apiClient.put(`${EXPENSE_KINDS[item.kind].api}/${id}/approve`)
                          )
                        }
                        className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        {busy ? "處理中..." : "核准"}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rejecting && (
        <RejectModal
          title={`駁回${EXPENSE_KINDS[rejecting.kind].name}`}
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            await apiClient.put(`${EXPENSE_KINDS[rejecting.kind].api}/${rejecting.id}/reject`, { rejectReason: reason });
            setRejecting(null);
            await load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}
