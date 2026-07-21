import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRightLeft,
  CheckCircle,
  Clock,
  Link2,
  NotebookPen,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type {
  FinanceCategory,
  FinanceParty,
  FinanceRecord,
  FinanceRecordType,
} from "../../api/types";

const TYPE_LABELS: Record<FinanceRecordType, string> = {
  EXPENSE: "支出",
  INCOME: "收入",
  TRANSFER: "內部撥款",
};

const TYPE_COLORS: Record<FinanceRecordType, string> = {
  EXPENSE: "bg-red-100 text-red-700",
  INCOME: "bg-green-100 text-green-700",
  TRANSFER: "bg-blue-100 text-blue-700",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: {
    label: "待審核",
    color: "bg-amber-100 text-amber-700",
    icon: <Clock className="h-3 w-3" />,
  },
  REJECTED: {
    label: "已駁回",
    color: "bg-red-100 text-red-700",
    icon: <XCircle className="h-3 w-3" />,
  },
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "手動",
  IMPORT: "舊系統匯入",
  FUEL_REPORT: "加油回報帶入",
  PARKING_FEE_REPORT: "停車費回報帶入",
  MAINTENANCE_LOG: "維修履歷帶入",
  SALARY_SNAPSHOT: "薪資封存帶入",
};

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface FormState {
  date: string;
  type: FinanceRecordType;
  partyId: string;
  counterPartyId: string;
  categoryId: string;
  amount: string;
  note: string;
}

function emptyForm(): FormState {
  return {
    date: todayStr(),
    type: "EXPENSE",
    partyId: "",
    counterPartyId: "",
    categoryId: "",
    amount: "",
    note: "",
  };
}

// 記帳輸入表單（新增與編輯共用）
function RecordForm({
  parties,
  categories,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  warning,
}: {
  parties: FinanceParty[];
  categories: FinanceCategory[];
  initial: FormState;
  submitLabel: string;
  onSubmit: (form: FormState) => Promise<void>;
  onCancel?: () => void;
  warning?: string | null;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeParties = parties.filter((p) => p.isActive);
  const typeCategories = categories.filter(
    (c) => c.isActive && c.kind === (form.type === "INCOME" ? "INCOME" : "EXPENSE")
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);
    if (!form.partyId) return setError(form.type === "TRANSFER" ? "請選擇轉出方" : "請選擇關係人");
    if (form.type === "TRANSFER") {
      if (!form.counterPartyId) return setError("請選擇轉入方");
      if (form.counterPartyId === form.partyId) return setError("轉出方與轉入方不可相同");
    } else if (!form.categoryId) {
      return setError("請選擇分類");
    }
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return setError("金額必須大於 0");

    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-3">
      {/* 類型切換 */}
      <div className="flex gap-2">
        {(Object.keys(TYPE_LABELS) as FinanceRecordType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => set("type", t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              form.type === t
                ? "bg-blue-600 text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">日期</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>

        {form.type === "TRANSFER" ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">轉出方（撥給）</label>
              <select
                value={form.partyId}
                onChange={(e) => set("partyId", e.target.value)}
                className={`${inputClass} w-full`}
              >
                <option value="">請選擇</option>
                {activeParties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">轉入方（收到）</label>
              <select
                value={form.counterPartyId}
                onChange={(e) => set("counterPartyId", e.target.value)}
                className={`${inputClass} w-full`}
              >
                <option value="">請選擇</option>
                {activeParties
                  .filter((p) => p.id !== form.partyId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">關係人</label>
              <select
                value={form.partyId}
                onChange={(e) => set("partyId", e.target.value)}
                className={`${inputClass} w-full`}
              >
                <option value="">請選擇</option>
                {activeParties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">分類</label>
              <select
                value={form.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                className={`${inputClass} w-full`}
              >
                <option value="">請選擇</option>
                {typeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">金額</label>
          <input
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="0"
            className={`${inputClass} w-full`}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">備註（選填）</label>
        <input
          type="text"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          placeholder="例如：6月租金、5109 後車胎更換..."
          className={`${inputClass} w-full`}
        />
      </div>

      {warning && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{warning}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            取消
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? "送出中..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

export function FinanceRecordsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [parties, setParties] = useState<FinanceParty[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 從網址帶入初始篩選（例如儀表板「記帳待審核」提醒連結 ?status=PENDING）
  const [searchParams, setSearchParams] = useSearchParams();

  const [filterType, setFilterType] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") ?? "");
  const [keyword, setKeyword] = useState("");

  const [editTarget, setEditTarget] = useState<FinanceRecord | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formKey, setFormKey] = useState(0); // 新增成功後重置表單
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    Promise.all([
      apiClient.get<FinanceParty[]>("/finance/parties"),
      apiClient.get<FinanceCategory[]>("/finance/categories"),
    ])
      .then(([p, c]) => {
        setParties(p.data);
        setCategories(c.data);
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  // 網址帶入的篩選只作為進入頁面時的初始值，套用後即清掉，避免後續手動改篩選時網址與畫面不一致
  useEffect(() => {
    if (searchParams.has("status")) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { year, month };
      if (filterType) params.type = filterType;
      if (filterPartyId) params.partyId = filterPartyId;
      if (filterCategoryId) params.categoryId = filterCategoryId;
      if (filterStatus) params.status = filterStatus;
      if (keyword.trim()) params.keyword = keyword.trim();
      const { data } = await apiClient.get<FinanceRecord[]>("/finance/records", { params });
      setRecords(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [year, month, filterType, filterPartyId, filterCategoryId, filterStatus, keyword]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  function goToMonth(y: number, m: number) {
    if (m < 1) { setYear(y - 1); setMonth(12); }
    else if (m > 12) { setYear(y + 1); setMonth(1); }
    else { setYear(y); setMonth(m); }
  }

  async function handleCreate(form: FormState) {
    await apiClient.post("/finance/records", {
      date: form.date,
      type: form.type,
      partyId: form.partyId,
      counterPartyId: form.type === "TRANSFER" ? form.counterPartyId : null,
      categoryId: form.type === "TRANSFER" ? null : form.categoryId,
      amount: Number(form.amount),
      note: form.note || null,
    });
    setFormKey((k) => k + 1);
    await loadRecords();
  }

  async function handleUpdate(id: string, form: FormState) {
    await apiClient.put(`/finance/records/${id}`, {
      date: form.date,
      type: form.type,
      partyId: form.partyId,
      counterPartyId: form.type === "TRANSFER" ? form.counterPartyId : null,
      categoryId: form.type === "TRANSFER" ? null : form.categoryId,
      amount: Number(form.amount),
      note: form.note || null,
    });
    setEditTarget(null);
    await loadRecords();
  }

  async function handleApprove(id: string) {
    setApprovingId(id);
    try {
      await apiClient.put(`/finance/records/${id}/approve`);
      await loadRecords();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) {
      setError("請填寫駁回原因");
      return;
    }
    try {
      await apiClient.put(`/finance/records/${id}/reject`, { rejectReason: rejectReason.trim() });
      setRejectTargetId(null);
      setRejectReason("");
      await loadRecords();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await apiClient.delete(`/finance/records/${id}`);
      setConfirmDeleteId(null);
      await loadRecords();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  // 合計只算已核准帳目（與報表口徑一致）
  const monthTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let pending = 0;
    for (const r of records) {
      if (r.status === "PENDING") pending += 1;
      if (r.status !== "APPROVED") continue;
      if (r.type === "INCOME") income += r.amount;
      else if (r.type === "EXPENSE") expense += r.amount;
    }
    return { income, expense, pending };
  }, [records]);

  const selectClass =
    "rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <NotebookPen className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-gray-800">記帳</h1>
      </div>

      {/* 快速輸入 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          新增帳目
          {!isAdmin && (
            <span className="ml-2 text-xs font-normal text-amber-600">
              （您記的帳需董事長審核通過後才計入報表）
            </span>
          )}
        </h2>
        <RecordForm
          key={formKey}
          parties={parties}
          categories={categories}
          initial={emptyForm()}
          submitLabel="新增帳目"
          onSubmit={handleCreate}
        />
      </div>

      {/* 月份選擇＋篩選 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <button type="button" onClick={() => goToMonth(year, month - 1)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
          <span className="flex items-center rounded border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-700">
            {year} 年 {month} 月
          </span>
          <button type="button" onClick={() => goToMonth(year, month + 1)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={selectClass}>
          <option value="">所有類型</option>
          <option value="EXPENSE">支出</option>
          <option value="INCOME">收入</option>
          <option value="TRANSFER">內部撥款</option>
        </select>
        <select value={filterPartyId} onChange={(e) => setFilterPartyId(e.target.value)} className={selectClass}>
          <option value="">所有關係人</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)} className={selectClass}>
          <option value="">所有分類</option>
          {categories
            .filter((c) => !filterType || filterType === "TRANSFER"
              ? true
              : c.kind === (filterType === "INCOME" ? "INCOME" : "EXPENSE"))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === "INCOME" ? "收入" : "支出"}｜{c.name}
              </option>
            ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
          <option value="">所有狀態</option>
          <option value="PENDING">待審核</option>
          <option value="APPROVED">已核准</option>
          <option value="REJECTED">已駁回</option>
        </select>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="關鍵字（備註／關係人／分類）"
          className={`${selectClass} w-56`}
        />
        <span className="ml-auto text-sm text-gray-500">
          {monthTotals.pending > 0 && (
            <span className="mr-3 rounded-md bg-amber-50 px-2 py-1 text-amber-700">
              待審核 {monthTotals.pending} 筆
            </span>
          )}
          已核准收入 <span className="font-semibold text-green-700">{fmt(monthTotals.income)}</span>
          ・支出 <span className="font-semibold text-red-700">{fmt(monthTotals.expense)}</span>
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 明細列表 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-4 text-sm text-gray-500">載入中...</p>
        ) : records.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">本月尚無符合條件的帳目</p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">類型</th>
                <th className="px-3 py-2 text-left">關係人</th>
                <th className="px-3 py-2 text-left">分類／方向</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2 text-left">備註</th>
                <th className="px-3 py-2 text-left">來源</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.date.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[r.type]}`}>
                      {TYPE_LABELS[r.type]}
                    </span>
                    {STATUS_CONFIG[r.status] && (
                      <span
                        className={`ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${STATUS_CONFIG[r.status].color}`}
                        title={r.status === "REJECTED" && r.rejectReason ? `駁回原因：${r.rejectReason}` : undefined}
                      >
                        {STATUS_CONFIG[r.status].icon}
                        {STATUS_CONFIG[r.status].label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.party.name}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.type === "TRANSFER" ? (
                      <span className="inline-flex items-center gap-1">
                        <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />
                        撥給 {r.counterParty?.name ?? "-"}
                      </span>
                    ) : (
                      r.category?.name ?? "-"
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                    r.type === "EXPENSE" ? "text-red-700" : r.type === "INCOME" ? "text-green-700" : "text-gray-800"
                  }`}>
                    {r.type === "EXPENSE" ? "-" : ""}{fmt(r.amount)}
                  </td>
                  <td className="max-w-[240px] px-3 py-2 text-gray-500">
                    <span className="block truncate" title={r.note ?? ""}>{r.note ?? "-"}</span>
                    {r.status === "REJECTED" && r.rejectReason && (
                      <span className="block truncate text-xs text-red-600" title={r.rejectReason}>
                        駁回：{r.rejectReason}
                      </span>
                    )}
                    {r.status === "PENDING" && r.createdBy && (
                      <span className="block text-xs text-amber-600">記帳者：{r.createdBy.name}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.sourceLinks.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600"
                        title={`連結 ${r.sourceLinks.length} 筆來源紀錄`}>
                        <Link2 className="h-3 w-3" />
                        {SOURCE_LABELS[r.sourceType] ?? r.sourceType}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">{SOURCE_LABELS[r.sourceType] ?? r.sourceType}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {(() => {
                      // 非董事長只能操作自己記的、尚未核准的帳目
                      const canModify =
                        isAdmin || (r.createdBy?.id === user?.id && r.status !== "APPROVED");
                      return confirmDeleteId === r.id ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <button type="button" disabled={deleting} onClick={() => handleDelete(r.id)}
                            className="text-red-600 hover:underline disabled:opacity-60">
                            確認刪除{r.sourceLinks.length > 0 ? "（將釋放來源）" : ""}
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-gray-400">
                            取消
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {isAdmin && r.status === "PENDING" && (
                            <>
                              <button type="button" disabled={approvingId === r.id}
                                onClick={() => handleApprove(r.id)}
                                className="flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60">
                                <CheckCircle className="h-3.5 w-3.5" />
                                {approvingId === r.id ? "..." : "核准"}
                              </button>
                              <button type="button"
                                onClick={() => { setRejectTargetId(r.id); setRejectReason(""); }}
                                className="flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                                <XCircle className="h-3.5 w-3.5" />
                                駁回
                              </button>
                            </>
                          )}
                          {canModify && (
                            <>
                              <button type="button" onClick={() => setEditTarget(r)}
                                className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="編輯">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => setConfirmDeleteId(r.id)}
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="刪除">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 編輯 Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-lg">
            <h3 className="mb-3 text-base font-semibold text-gray-800">編輯帳目</h3>
            <RecordForm
              parties={parties}
              categories={categories}
              initial={{
                date: editTarget.date.slice(0, 10),
                type: editTarget.type,
                partyId: editTarget.partyId,
                counterPartyId: editTarget.counterPartyId ?? "",
                categoryId: editTarget.categoryId ?? "",
                amount: String(editTarget.amount),
                note: editTarget.note ?? "",
              }}
              submitLabel="儲存變更"
              onSubmit={(form) => handleUpdate(editTarget.id, form)}
              onCancel={() => setEditTarget(null)}
              warning={
                editTarget.sourceLinks.length > 0
                  ? `此帳目由「${SOURCE_LABELS[editTarget.sourceType] ?? editTarget.sourceType}」帶入，連結 ${editTarget.sourceLinks.length} 筆來源紀錄。修改金額後帳本以此為準，不影響來源資料。`
                  : !isAdmin
                    ? "修改後將重新送審，需董事長核准才計入報表。"
                    : null
              }
            />
          </div>
        </div>
      )}

      {/* 駁回原因 Modal */}
      {rejectTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="mb-3 text-base font-semibold text-gray-800">駁回帳目</h3>
            <label className="mb-1 block text-sm font-medium text-gray-700">駁回原因</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="請輸入駁回原因，記帳者可修改後重新送審..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectTargetId(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                取消
              </button>
              <button type="button" onClick={() => handleReject(rejectTargetId)}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700">
                確認駁回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
