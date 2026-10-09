import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { ExpenseContext, LeaveRequest, RepairRequest } from "../../api/types";
import { RejectModal } from "../expense/expenseShared";
import { EXPENSE_KINDS, VEHICLE_TYPE_LABELS, formatDate, type ExpenseKind, type ExpenseReport } from "../expense/expenseKinds";
import { LEAVE_TYPE_LABEL, groupLeaves, leaveRangeLabel, type LeaveGroup } from "../../constants/leave";

export interface ReviewSummary {
  fuel: number | null;
  parking: number | null;
  leave: number | null;
  repair: number | null;
}

type Item =
  | { kind: ExpenseKind; key: string; at: string; report: ExpenseReport }
  | { kind: "leave"; key: string; at: string; group: LeaveGroup }
  | { kind: "repair"; key: string; at: string; repair: RepairRequest };

const KIND_CHIP: Record<Item["kind"], { label: string; className: string }> = {
  fuel: { label: "油資", className: "bg-blue-50 text-blue-700" },
  parking: { label: "停車費", className: "bg-emerald-50 text-emerald-700" },
  leave: { label: "請假", className: "bg-amber-50 text-amber-800" },
  repair: { label: "報修", className: "bg-gray-100 text-gray-700" },
};

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

// 油資／停車費的參考資訊：這個人這個月第幾筆、合計多少；這台車上次加油幾天前
function contextLine(kind: ExpenseKind, c?: ExpenseContext): string | null {
  if (!c) return null;
  const parts = [`這個月第 ${c.monthCount} 筆，合計 ${money(c.monthTotal)}`];
  if (kind === "fuel" && c.lastDaysAgo !== null) {
    parts.push(c.lastDaysAgo === 0 ? `這台車同一天還有一筆加油（${money(c.lastAmount ?? 0)}）` : `這台車上次加油 ${c.lastDaysAgo} 天前（${money(c.lastAmount ?? 0)}）`);
  }
  return parts.join("・");
}

// 審核中心「全部待處理」：把使用者有權處理的各類待辦依送出時間排成一張清單；
// 油資／停車費／請假可勾選多筆一次核准，或逐筆核准、駁回；報修需填處理內容，按「前往處理」切到報修分頁
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
  const [context, setContext] = useState<Record<string, ExpenseContext>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<{ kind: ExpenseKind; id: string } | null>(null);

  async function fetchAll() {
    const [fuel, parking, leaves, repairs, fuelCtx, parkingCtx] = await Promise.all([
      summary.fuel !== null
        ? apiClient.get<ExpenseReport[]>(EXPENSE_KINDS.fuel.api, { params: { status: "PENDING" } }).then((r) => r.data)
        : [],
      summary.parking !== null
        ? apiClient.get<ExpenseReport[]>(EXPENSE_KINDS.parking.api, { params: { status: "PENDING" } }).then((r) => r.data)
        : [],
      summary.leave !== null ? apiClient.get<LeaveRequest[]>("/leaves", { params: { status: "PENDING" } }).then((r) => r.data) : [],
      summary.repair !== null ? apiClient.get<RepairRequest[]>("/repair-requests").then((r) => r.data) : [],
      summary.fuel !== null
        ? apiClient.get<Record<string, ExpenseContext>>("/review/expense-context", { params: { kind: "fuel" } }).then((r) => r.data)
        : {},
      summary.parking !== null
        ? apiClient.get<Record<string, ExpenseContext>>("/review/expense-context", { params: { kind: "parking" } }).then((r) => r.data)
        : {},
    ]);
    const next: Item[] = [
      ...fuel.map((report) => ({ kind: "fuel" as const, key: `fuel:${report.id}`, at: report.createdAt, report })),
      ...parking.map((report) => ({ kind: "parking" as const, key: `parking:${report.id}`, at: report.createdAt, report })),
      ...groupLeaves(leaves).map((group) => ({ kind: "leave" as const, key: `leave:${group.key}`, at: group.createdAt, group })),
      ...repairs
        .filter((r) => r.status === "PENDING" || r.status === "IN_PROGRESS")
        .map((repair) => ({ kind: "repair" as const, key: `repair:${repair.id}`, at: repair.createdAt, repair })),
    ];
    next.sort((a, b) => a.at.localeCompare(b.at));
    return { items: next, context: { ...fuelCtx, ...parkingCtx } };
  }

  async function load() {
    try {
      const data = await fetchAll();
      setItems(data.items);
      setContext(data.context);
      setPicked((cur) => new Set([...cur].filter((k) => data.items.some((i) => i.key === k))));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    let active = true;
    fetchAll()
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setContext(data.context);
      })
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 依類別送出一次核准；回傳上月補報的提示
  async function approve(targets: Item[]) {
    if (targets.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const carried: string[] = [];
      for (const kind of ["fuel", "parking"] as const) {
        const ids = targets.filter((t) => t.kind === kind).map((t) => (t as { report: ExpenseReport }).report.id);
        if (ids.length === 0) continue;
        const { data } = await apiClient.post<{ carried: { carriedTo: string }[] }>(`${EXPENSE_KINDS[kind].api}/approve-batch`, { ids });
        carried.push(...data.carried.map((c) => c.carriedTo));
      }
      const leaveIds = targets.filter((t) => t.kind === "leave").flatMap((t) => (t as { group: LeaveGroup }).group.ids);
      if (leaveIds.length > 0) await apiClient.post("/leaves/review-batch", { ids: leaveIds, action: "approve" });
      if (carried.length > 0) setNotice(`其中 ${carried.length} 筆的月份薪資已結算，已計入 ${[...new Set(carried)].join("、")}薪資（上月補報）`);
      setPicked(new Set());
      await load();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function rejectLeave(group: LeaveGroup) {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post("/leaves/review-batch", { ids: group.ids, action: "reject" });
      await load();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const selectable = items.filter((i) => i.kind !== "repair");
  const flaggedOf = (i: Item) => (i.kind === "fuel" || i.kind === "parking" ? context[i.report.id]?.flag ?? null : null);
  const pickedItems = selectable.filter((i) => picked.has(i.key));
  // 「全選」不勾資料檢查有標記的（例如同車同天兩筆加油），要一筆一筆看
  const safeKeys = selectable.filter((i) => !flaggedOf(i)).map((i) => i.key);

  function toggle(key: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!loaded) return <p className="text-sm text-gray-500">載入中...</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

      {selectable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <button
            type="button"
            onClick={() => setPicked(pickedItems.length > 0 ? new Set() : new Set(safeKeys))}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100"
          >
            {pickedItems.length > 0 ? "全不選" : "全選（有標記的不選）"}
          </button>
          <span className="text-xs text-gray-500">已勾選 {pickedItems.length} 筆</span>
          <div className="flex-1" />
          <button
            type="button"
            disabled={busy || pickedItems.length === 0}
            onClick={() => approve(pickedItems)}
            className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {busy ? "處理中..." : `核准勾選的 ${pickedItems.length} 筆`}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">目前沒有待處理的項目</div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const chip = KIND_CHIP[item.kind];
            const flag = flaggedOf(item);
            const ctx = item.kind === "fuel" || item.kind === "parking" ? contextLine(item.kind, context[item.report.id]) : null;
            return (
              <li
                key={item.key}
                className={`flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-sm ${flag ? "border-amber-300" : "border-gray-200"}`}
              >
                {item.kind !== "repair" ? (
                  <input
                    type="checkbox"
                    aria-label="勾選這筆"
                    checked={picked.has(item.key)}
                    onChange={() => toggle(item.key)}
                    className="h-4 w-4 accent-blue-600"
                  />
                ) : (
                  <span className="w-4" />
                )}
                <span className={`w-14 flex-shrink-0 rounded px-2 py-0.5 text-center text-xs font-semibold ${chip.className}`}>{chip.label}</span>
                <div className="min-w-0 flex-1">
                  {item.kind === "leave" ? (
                    <>
                      <p className="text-sm font-medium text-gray-800">
                        {item.group.userName}・{leaveRangeLabel(item.group)}
                        {item.group.type && <span className="ml-1.5 text-xs font-normal text-gray-500">{LEAVE_TYPE_LABEL[item.group.type]}</span>}
                      </p>
                      <p className="text-xs text-gray-500">{item.group.reason || "未填原因"}</p>
                    </>
                  ) : item.kind === "repair" ? (
                    <>
                      <p className="text-sm font-medium text-gray-800">
                        {item.repair.vehicle ? `${VEHICLE_TYPE_LABELS[item.repair.vehicle.type]} ${item.repair.vehicle.plateNumber}` : "車輛"}
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
                        {item.report.employee?.name ?? "-"}・<span className="font-semibold">{money(item.report.amount)}</span>
                        {item.report.enteredBy && <span className="ml-1.5 text-xs font-normal text-purple-700">由 {item.report.enteredBy.name} 代填</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(item.report.date)}
                        {item.report.vehicle && `・${VEHICLE_TYPE_LABELS[item.report.vehicle.type]} ${item.report.vehicle.plateNumber}`}
                        {item.report.note && `・${item.report.note}`}
                      </p>
                      {ctx && <p className="text-xs text-gray-400">{ctx}</p>}
                      {flag && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          資料檢查：{flag}
                        </p>
                      )}
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
                          item.kind === "leave" ? rejectLeave(item.group) : setRejecting({ kind: item.kind, id: item.report.id })
                        }
                        className="flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {item.kind === "leave" ? "拒絕" : "駁回"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => approve([item])}
                        className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        核准
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
