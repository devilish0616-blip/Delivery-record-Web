import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2, UserCheck } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { VehicleType } from "../../api/types";
import { ExpenseReportSummary, MonthStepper } from "./expenseShared";
import { EXPENSE_KINDS, VEHICLE_TYPE_LABELS, shiftMonth, todayStr, type ExpenseKind, type ExpenseReport } from "./expenseKinds";

interface VehicleOption {
  id: string;
  plateNumber: string;
  type: VehicleType;
}

interface ProxyTarget {
  id: string;
  name: string;
  accountNote: string | null;
  isProxyManaged: boolean;
}

const inputClass = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

// 員工送出加油／停車費回報＋查看自己當月紀錄（「我的申請」頁的加油、停車費分頁）
// 具代填權限者（範圍同代填送件）可切換「替誰填寫」，替代管帳號送出並查看其紀錄；網址 ?for= 可直接帶入對象
export function ExpenseReportPanel({ kind }: { kind: ExpenseKind }) {
  const cfg = EXPENSE_KINDS[kind];
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canProxy = isAdmin || user?.role === "MANAGER" || !!user?.capabilities?.includes("PROXY_DELIVERY");
  const [searchParams, setSearchParams] = useSearchParams();
  const forId = canProxy ? searchParams.get("for") ?? "" : "";
  const [targets, setTargets] = useState<ProxyTarget[]>([]);
  // 董事長從網址帶入對象時（可能是一般員工），直接用「所有員工」清單才選得到
  const [scopeAll, setScopeAll] = useState(() => isAdmin && !!forId);
  const now = new Date();
  const [{ year, month }, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formDate, setFormDate] = useState(todayStr());
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formVehicleType, setFormVehicleType] = useState<VehicleType>("MOTORCYCLE");
  const [formVehicleId, setFormVehicleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredVehicles = vehicles.filter((v) => v.type === formVehicleType);

  useEffect(() => {
    apiClient
      .get<VehicleOption[]>("/vehicles")
      .then(({ data }) => setVehicles(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canProxy) return;
    apiClient
      .get<ProxyTarget[]>(`${cfg.api}/proxy-targets`, { params: { scope: scopeAll ? "all" : undefined } })
      .then(({ data }) => setTargets(data))
      .catch(() => {});
  }, [canProxy, cfg.api, scopeAll]);

  function selectTarget(id: string) {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("for", id);
    else next.delete("for");
    setSearchParams(next, { replace: true });
  }

  const target = targets.find((t) => t.id === forId);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const { data } = forId
        ? await apiClient.get<ExpenseReport[]>(`${cfg.api}/proxy`, { params: { year, month, employeeId: forId } })
        : await apiClient.get<ExpenseReport[]>(`${cfg.api}/my`, { params: { year, month } });
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
  }, [year, month, forId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const amt = parseFloat(formAmount);
    if (!formDate) return setFormError(`請選擇${cfg.dateLabel}`);
    if (isNaN(amt) || amt <= 0) return setFormError("請輸入有效的金額");
    if (!formVehicleId) return setFormError("請選擇本次使用的車輛");

    setSubmitting(true);
    try {
      await apiClient.post(cfg.api, {
        date: formDate,
        amount: amt,
        note: formNote.trim() || null,
        vehicleId: formVehicleId,
        ...(forId ? { employeeId: forId } : {}),
      });
      setFormAmount("");
      setFormNote("");
      setFormVehicleId("");
      setFormVehicleType("MOTORCYCLE");
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
      await apiClient.delete(`${cfg.api}/${id}`);
      setConfirmDeleteId(null);
      await loadReports();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const totalApproved = reports.filter((r) => r.status === "APPROVED").reduce((sum, r) => sum + r.amount, 0);
  const pendingCount = reports.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      {canProxy && (targets.length > 0 || isAdmin || forId) && (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${
            forId ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"
          }`}
        >
          <UserCheck className={`h-4 w-4 ${forId ? "text-purple-700" : "text-gray-500"}`} />
          <label htmlFor={`${kind}-for`} className="text-sm font-medium text-gray-700">
            替誰填寫
          </label>
          <select
            id={`${kind}-for`}
            value={forId}
            onChange={(e) => selectTarget(e.target.value)}
            className="min-w-[10rem] rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">自己</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isProxyManaged ? "（代管）" : ""}
                {t.accountNote ? `・${t.accountNote}` : ""}
              </option>
            ))}
          </select>
          {isAdmin && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} />
              顯示所有員工
            </label>
          )}
          {forId && (
            <span className="text-xs text-purple-800">
              代填中：送出的回報會記在「{target?.name ?? "此員工"}」名下，並記錄由您代填
            </span>
          )}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">
          {forId ? `替 ${target?.name ?? "此員工"} 新增${cfg.name}` : `新增${cfg.name}`}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor={`${kind}-date`} className="mb-1 block text-sm font-medium text-gray-700">
                {cfg.dateLabel}
              </label>
              <input
                id={`${kind}-date`}
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`${kind}-amount`} className="mb-1 block text-sm font-medium text-gray-700">
                金額（元）
              </label>
              <input
                id={`${kind}-amount`}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder={cfg.amountPlaceholder}
                className={inputClass}
              />
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">車輛類型</span>
              <div className="flex gap-2">
                {(["MOTORCYCLE", "TRUCK"] as VehicleType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setFormVehicleType(type);
                      setFormVehicleId("");
                    }}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                      formVehicleType === type
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {VEHICLE_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor={`${kind}-vehicle`} className="mb-1 block text-sm font-medium text-gray-700">
                {VEHICLE_TYPE_LABELS[formVehicleType]}車牌 <span className="text-red-500">*</span>
              </label>
              <select
                id={`${kind}-vehicle`}
                value={formVehicleId}
                onChange={(e) => setFormVehicleId(e.target.value)}
                className={inputClass}
              >
                <option value="">請選擇車輛</option>
                {filteredVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${kind}-note`} className="mb-1 block text-sm font-medium text-gray-700">
                備註（選填）
              </label>
              <input
                id={`${kind}-note`}
                type="text"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder={cfg.notePlaceholder}
                className={inputClass}
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
              {submitting ? "送出中..." : forId ? "代填送出" : "送出回報"}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-800">
            {forId ? `${target?.name ?? ""} ` : ""}
            {year} 年 {month} 月 {cfg.name}紀錄
            {pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {pendingCount} 筆待審核
              </span>
            )}
          </h2>
          <MonthStepper year={year} month={month} showToday onChange={(y, m) => setYm(shiftMonth(y, m))} />
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        {!loading && totalApproved > 0 && (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-4 py-2.5">
            <p className="text-sm text-green-800">
              本月已核准{cfg.short}補貼合計：
              <span className="ml-1 font-semibold">${Math.round(totalApproved).toLocaleString()}</span>
              元（將計入當月薪資）
            </p>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">載入中...</p>
          ) : reports.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">本月尚無{cfg.name}紀錄</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {reports.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <ExpenseReportSummary report={r} />
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
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-gray-400">
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
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
