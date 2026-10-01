import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRightLeft,
  CheckCircle,
  Clock,
  Link2,
  NotebookPen,
  Pencil,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { YearMonthPicker } from "../../components/YearMonthPicker";
import type {
  FinanceCategory,
  FinanceCategoryGroup,
  FinanceParty,
  FinanceRecord,
  FinanceRecordType,
} from "../../api/types";

const TYPE_LABELS: Record<FinanceRecordType, string> = {
  EXPENSE: "支出",
  INCOME: "收入",
  TRANSFER: "內部撥款",
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
  LOAN_PAYMENT: "車貸分期帶入",
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

// 分類標籤顏色：依損益歸屬（直接成本／營業費用／收入／撥款）區分
function categoryChipClass(r: FinanceRecord, groups: Map<string, FinanceCategoryGroup | null>): string {
  if (r.type === "TRANSFER") return "bg-blue-50 text-blue-800";
  if (r.type === "INCOME") return "bg-green-50 text-green-800";
  const g = r.categoryId ? groups.get(r.categoryId) : null;
  if (g === "DIRECT_COST") return "bg-orange-50 text-orange-800";
  if (g === "OTHER_EXPENSE") return "bg-gray-100 text-gray-700";
  return "bg-slate-100 text-slate-700";
}

const TYPE_ACTIVE: Record<FinanceRecordType, string> = {
  EXPENSE: "text-red-700",
  INCOME: "text-green-700",
  TRANSFER: "text-blue-700",
};

function Chip({
  active,
  onClick,
  children,
  solid,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  solid?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-lg border px-3 text-sm transition-colors ${
        active
          ? solid
            ? "border-blue-600 bg-blue-600 font-semibold text-white"
            : "border-blue-600 bg-blue-50 font-semibold text-blue-700"
          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

// 記帳輸入表單（新增與編輯共用）；新增模式儲存後保留日期／類型／關係人／分類，方便連續記帳
function RecordForm({
  parties,
  categories,
  usage,
  recentRecords,
  initial,
  mode,
  onSubmit,
  onCancel,
  warning,
}: {
  parties: FinanceParty[];
  categories: FinanceCategory[];
  usage: Map<string, number>; // 分類使用次數（排序用）
  recentRecords: FinanceRecord[]; // 提供「最近用過的備註」
  initial: FormState;
  mode: "create" | "edit";
  onSubmit: (form: FormState) => Promise<void>;
  onCancel?: () => void;
  warning?: string | null;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  const activeParties = parties.filter((p) => p.isActive || p.id === form.partyId || p.id === form.counterPartyId);
  const typeCategories = categories
    .filter((c) => (c.isActive || c.id === form.categoryId) && c.kind === (form.type === "INCOME" ? "INCOME" : "EXPENSE"))
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.sortOrder - b.sortOrder);

  const recentNotes = useMemo(() => {
    const pick = (list: FinanceRecord[]) =>
      [...new Set(list.map((r) => r.note?.trim()).filter((n): n is string => !!n))].slice(0, 4);
    const sameCategory = form.categoryId ? pick(recentRecords.filter((r) => r.categoryId === form.categoryId)) : [];
    return sameCategory.length > 0 ? sameCategory : pick(recentRecords.filter((r) => r.type === form.type));
  }, [recentRecords, form.categoryId, form.type]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSavedHint(false);
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setType(t: FinanceRecordType) {
    // 切換收入／支出時分類種類不同，清掉已選分類
    setForm((f) => ({ ...f, type: t, categoryId: t === f.type ? f.categoryId : "", counterPartyId: "" }));
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
      if (mode === "create") {
        setForm((f) => ({ ...f, amount: "", note: "" }));
        setSavedHint(true);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const label = "mb-1.5 block text-xs font-medium text-gray-500";
  const inputClass = "h-10 rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
        {(Object.keys(TYPE_LABELS) as FinanceRecordType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`h-8 rounded-md text-sm ${
              form.type === t ? `bg-white font-semibold shadow-sm ${TYPE_ACTIVE[t]}` : "text-gray-600 hover:text-gray-800"
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>日期</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            className={`${inputClass} w-full font-mono`}
          />
        </div>
        <div>
          <label className={label}>金額</label>
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="0"
            className={`${inputClass} w-full text-right font-mono text-base font-semibold`}
          />
        </div>
      </div>

      {form.type === "TRANSFER" ? (
        <>
          <div>
            <label className={label}>轉出方（撥給）</label>
            <div className="flex flex-wrap gap-1.5">
              {activeParties.map((p) => (
                <Chip key={p.id} active={form.partyId === p.id} onClick={() => set("partyId", p.id)}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>轉入方（收到）</label>
            <div className="flex flex-wrap gap-1.5">
              {activeParties
                .filter((p) => p.id !== form.partyId)
                .map((p) => (
                  <Chip key={p.id} active={form.counterPartyId === p.id} onClick={() => set("counterPartyId", p.id)}>
                    {p.name}
                  </Chip>
                ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className={label}>
              分類 <span className="font-normal text-gray-400">・常用的排前面</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {typeCategories.map((c) => (
                <Chip key={c.id} solid active={form.categoryId === c.id} onClick={() => set("categoryId", c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>{form.type === "INCOME" ? "關係人（收款人）" : "關係人（付款人）"}</label>
            <div className="flex flex-wrap gap-1.5">
              {activeParties.map((p) => (
                <Chip key={p.id} active={form.partyId === p.id} onClick={() => set("partyId", p.id)}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <label className={label}>備註（選填）</label>
        <input
          type="text"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="例如：6月租金、5109 後車胎更換..."
          className={`${inputClass} w-full`}
        />
        {recentNotes.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-400">最近用過：</span>
            {recentNotes.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set("note", n)}
                className="max-w-[160px] truncate rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      {warning && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{warning}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {mode === "create" ? (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-11 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "送出中..." : "儲存並記下一筆"}
          </button>
          <p className={`text-center text-xs ${savedHint ? "text-green-700" : "text-gray-500"}`}>
            {savedHint ? "已儲存！日期、關係人與分類已保留，可直接輸入下一筆金額" : "儲存後保留日期與關係人，只清空金額與備註"}
          </p>
        </div>
      ) : (
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
            {submitting ? "送出中..." : "儲存變更"}
          </button>
        </div>
      )}
    </div>
  );
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAYS[d.getUTCDay()]}）`;
}

export function FinanceRecordsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const now = new Date();

  // 從網址帶入初始值（例如首頁待辦「記帳待核准」?status=PENDING、月報「查看本月明細」?year=&month=）
  const [searchParams, setSearchParams] = useSearchParams();
  const initYear = Number(searchParams.get("year"));
  const initMonth = Number(searchParams.get("month"));
  const [year, setYear] = useState(initYear >= 2000 ? initYear : now.getFullYear());
  const [month, setMonth] = useState(initMonth >= 1 && initMonth <= 12 ? initMonth : now.getMonth() + 1);

  const [parties, setParties] = useState<FinanceParty[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterType, setFilterType] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") ?? "");
  const [keyword, setKeyword] = useState("");

  const [editTarget, setEditTarget] = useState<FinanceRecord | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [batchApproving, setBatchApproving] = useState(false);
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

  // 網址帶入的值只作為進入頁面時的初始值，套用後即清掉，避免後續手動切換時網址與畫面不一致
  useEffect(() => {
    if ([...searchParams.keys()].length > 0) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRecords = useCallback(async () => {
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
    setLoading(true);
    loadRecords();
  }, [loadRecords]);

  function toPayload(form: FormState) {
    return {
      date: form.date,
      type: form.type,
      partyId: form.partyId,
      counterPartyId: form.type === "TRANSFER" ? form.counterPartyId : null,
      categoryId: form.type === "TRANSFER" ? null : form.categoryId,
      amount: Number(form.amount),
      note: form.note || null,
    };
  }

  async function handleCreate(form: FormState) {
    await apiClient.post("/finance/records", toPayload(form));
    await loadRecords();
  }

  async function handleUpdate(id: string, form: FormState) {
    await apiClient.put(`/finance/records/${id}`, toPayload(form));
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

  async function handleApproveAll(ids: string[]) {
    if (!window.confirm(`確定核准列表中的 ${ids.length} 筆待審核帳目？核准後即計入報表。`)) return;
    setBatchApproving(true);
    try {
      await apiClient.post("/finance/records/approve-batch", { ids });
      await loadRecords();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBatchApproving(false);
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
    const pending: FinanceRecord[] = [];
    for (const r of records) {
      if (r.status === "PENDING") pending.push(r);
      if (r.status !== "APPROVED") continue;
      if (r.type === "INCOME") income += r.amount;
      else if (r.type === "EXPENSE") expense += r.amount;
    }
    return { income, expense, pending };
  }, [records]);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of records) if (r.categoryId) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    return m;
  }, [records]);

  const groupById = useMemo(() => new Map(categories.map((c) => [c.id, c.group])), [categories]);

  const byDay = useMemo(() => {
    const map = new Map<string, FinanceRecord[]>();
    for (const r of records) {
      const d = r.date.slice(0, 10);
      map.set(d, [...(map.get(d) ?? []), r]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [records]);

  const typeCounts = useMemo(() => {
    const c = { EXPENSE: 0, INCOME: 0, TRANSFER: 0 } as Record<FinanceRecordType, number>;
    for (const r of records) c[r.type] += 1;
    return c;
  }, [records]);

  const selectClass =
    "h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs focus:border-blue-500 focus:outline-none";
  const pendingAmount = monthTotals.pending.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold text-gray-800">記帳</h1>
        </div>
        <YearMonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {monthTotals.pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <Clock className="h-5 w-5 text-amber-700" />
          <div className="flex-1 text-sm text-amber-900">
            <b>{monthTotals.pending.length} 筆帳目待審核</b>・合計{" "}
            <span className="font-mono">{fmt(pendingAmount)}</span>・核准後才會計入月報
          </div>
          {filterStatus !== "PENDING" && (
            <button
              type="button"
              onClick={() => setFilterStatus("PENDING")}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100"
            >
              只看待審核
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              disabled={batchApproving}
              onClick={() => handleApproveAll(monthTotals.pending.map((r) => r.id))}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {batchApproving ? "核准中..." : "全部核准"}
            </button>
          )}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">
            新增帳目
            {!isAdmin && (
              <span className="mt-0.5 block text-xs font-normal text-amber-700">
                您記的帳需董事長審核通過後才計入報表
              </span>
            )}
          </h2>
          <RecordForm
            parties={parties}
            categories={categories}
            usage={usage}
            recentRecords={records}
            initial={emptyForm()}
            mode="create"
            onSubmit={handleCreate}
          />
        </section>

        <section className="min-w-0 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs text-gray-500">已核准收入</div>
              <div className="mt-0.5 font-mono text-lg font-semibold text-green-700 sm:text-xl">{fmt(monthTotals.income)}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs text-gray-500">已核准支出</div>
              <div className="mt-0.5 font-mono text-lg font-semibold text-red-700 sm:text-xl">{fmt(monthTotals.expense)}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div>
                <div className="text-xs text-gray-500">淨損益</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-gray-900 sm:text-xl">
                  {fmt(monthTotals.income - monthTotals.expense)}
                </div>
              </div>
              <Link to="/admin/finance/report" className="text-xs text-blue-600 hover:underline">
                看月報 →
              </Link>
            </div>
          </div>
          {(filterType || filterPartyId || filterCategoryId || filterStatus || keyword) && (
            <p className="text-xs text-gray-500">＊以上合計為目前篩選條件下的結果</p>
          )}

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 p-3">
              {(
                [
                  ["", `全部 ${records.length}`],
                  ["EXPENSE", `支出 ${typeCounts.EXPENSE}`],
                  ["INCOME", `收入 ${typeCounts.INCOME}`],
                  ["TRANSFER", `撥款 ${typeCounts.TRANSFER}`],
                ] as const
              ).map(([k, text]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setFilterType(k); setFilterCategoryId(""); }}
                  className={`h-8 rounded-full border px-3 text-xs ${
                    filterType === k
                      ? "border-blue-600 bg-blue-50 font-semibold text-blue-700"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {filterType === k || k === "" ? text : text.split(" ")[0]}
                </button>
              ))}
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass} aria-label="狀態篩選">
                <option value="">所有狀態</option>
                <option value="PENDING">待審核</option>
                <option value="APPROVED">已核准</option>
                <option value="REJECTED">已駁回</option>
              </select>
              <select value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)} className={selectClass} aria-label="分類篩選">
                <option value="">所有分類</option>
                {categories
                  .filter((c) =>
                    !filterType || filterType === "TRANSFER" ? true : c.kind === (filterType === "INCOME" ? "INCOME" : "EXPENSE")
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.kind === "INCOME" ? "收入" : "支出"}｜{c.name}
                    </option>
                  ))}
              </select>
              <select value={filterPartyId} onChange={(e) => setFilterPartyId(e.target.value)} className={selectClass} aria-label="關係人篩選">
                <option value="">所有關係人</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <label className="flex h-8 min-w-[160px] flex-1 items-center gap-1.5 rounded-lg border border-gray-300 px-2 sm:max-w-[220px]">
                <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="備註／關係人／分類"
                  aria-label="關鍵字搜尋"
                  className="min-w-0 flex-1 border-none text-xs focus:outline-none"
                />
              </label>
            </div>

            {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}

            {loading ? (
              <p className="p-4 text-sm text-gray-500">載入中...</p>
            ) : records.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">本月尚無符合條件的帳目</p>
            ) : (
              byDay.map(([date, rows]) => {
                const inc = rows.filter((r) => r.type === "INCOME").reduce((s, r) => s + r.amount, 0);
                const exp = rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + r.amount, 0);
                return (
                  <div key={date}>
                    <div className="flex justify-between border-b border-gray-100 bg-gray-50 px-4 py-1.5 text-xs text-gray-600">
                      <span className="font-semibold">{dayLabel(date)}</span>
                      <span className="font-mono">
                        {[inc > 0 && `收入 ${fmt(inc)}`, exp > 0 && `支出 ${fmt(exp)}`].filter(Boolean).join("・")}
                      </span>
                    </div>
                    {rows.map((r) => (
                      <RecordRow
                        key={r.id}
                        r={r}
                        chipClass={categoryChipClass(r, groupById)}
                        isAdmin={isAdmin}
                        canModify={isAdmin || (r.createdBy?.id === user?.id && r.status !== "APPROVED")}
                        confirmingDelete={confirmDeleteId === r.id}
                        deleting={deleting}
                        approving={approvingId === r.id}
                        onApprove={() => handleApprove(r.id)}
                        onReject={() => { setRejectTargetId(r.id); setRejectReason(""); }}
                        onEdit={() => setEditTarget(r)}
                        onAskDelete={() => setConfirmDeleteId(r.id)}
                        onCancelDelete={() => setConfirmDeleteId(null)}
                        onDelete={() => handleDelete(r.id)}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* 編輯 Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
            <h3 className="mb-3 text-base font-semibold text-gray-800">編輯帳目</h3>
            <RecordForm
              parties={parties}
              categories={categories}
              usage={usage}
              recentRecords={records}
              initial={{
                date: editTarget.date.slice(0, 10),
                type: editTarget.type,
                partyId: editTarget.partyId,
                counterPartyId: editTarget.counterPartyId ?? "",
                categoryId: editTarget.categoryId ?? "",
                amount: String(editTarget.amount),
                note: editTarget.note ?? "",
              }}
              mode="edit"
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

function RecordRow({
  r,
  chipClass,
  isAdmin,
  canModify,
  confirmingDelete,
  deleting,
  approving,
  onApprove,
  onReject,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  r: FinanceRecord;
  chipClass: string;
  isAdmin: boolean;
  canModify: boolean;
  confirmingDelete: boolean;
  deleting: boolean;
  approving: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_CONFIG[r.status];
  const title =
    r.type === "TRANSFER" ? `${r.party.name} → ${r.counterParty?.name ?? "-"}` : r.note || r.category?.name || "-";
  const meta = [
    r.type === "TRANSFER" ? "內部撥款・不計入損益" : r.party.name,
    SOURCE_LABELS[r.sourceType] ?? r.sourceType,
    r.type === "TRANSFER" && r.note ? r.note : null,
    r.status === "PENDING" && r.createdBy ? `記帳者：${r.createdBy.name}` : null,
  ].filter(Boolean);

  return (
    <div
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-gray-50 px-4 py-2.5 sm:grid-cols-[88px_minmax(0,1fr)_auto_110px_auto] ${
        r.status === "PENDING" ? "bg-amber-50/60" : r.status === "REJECTED" ? "bg-red-50/40" : "hover:bg-gray-50"
      }`}
    >
      <span className={`justify-self-start whitespace-nowrap rounded-md px-2 py-0.5 text-xs ${chipClass}`}>
        {r.type === "TRANSFER" ? (
          <span className="inline-flex items-center gap-1">
            <ArrowRightLeft className="h-3 w-3" />撥款
          </span>
        ) : (
          r.category?.name ?? "未分類"
        )}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-gray-900" title={r.note ?? ""}>{title}</span>
          {status && (
            <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${status.color}`}>
              {status.icon}
              {status.label}
            </span>
          )}
          {r.sourceLinks.length > 0 && (
            <span title={`連結 ${r.sourceLinks.length} 筆來源紀錄`}>
              <Link2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            </span>
          )}
        </div>
        <div className="truncate text-xs text-gray-500">{meta.join("・")}</div>
        {r.status === "REJECTED" && r.rejectReason && (
          <div className="truncate text-xs text-red-600" title={r.rejectReason}>駁回：{r.rejectReason}</div>
        )}
      </div>
      <div className="col-span-3 flex items-center gap-1 sm:col-span-1 sm:justify-end">
        {isAdmin && r.status === "PENDING" && !confirmingDelete && (
          <>
            <button type="button" disabled={approving} onClick={onApprove}
              className="flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60">
              <CheckCircle className="h-3.5 w-3.5" />
              {approving ? "..." : "核准"}
            </button>
            <button type="button" onClick={onReject}
              className="flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
              <XCircle className="h-3.5 w-3.5" />
              駁回
            </button>
          </>
        )}
      </div>
      <span
        className={`col-start-3 row-start-1 whitespace-nowrap text-right font-mono text-sm font-semibold sm:col-start-auto sm:row-start-auto ${
          r.type === "EXPENSE" ? "text-gray-900" : r.type === "INCOME" ? "text-green-700" : "text-blue-700"
        }`}
      >
        {r.type === "EXPENSE" ? "-" : r.type === "INCOME" ? "+" : ""}
        {fmt(r.amount)}
      </span>
      <div className="col-span-3 flex justify-end sm:col-span-1">
        {confirmingDelete ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
            <button type="button" disabled={deleting} onClick={onDelete} className="text-red-600 hover:underline disabled:opacity-60">
              確認刪除{r.sourceLinks.length > 0 ? "（將釋放來源）" : ""}
            </button>
            <button type="button" onClick={onCancelDelete} className="text-gray-400">取消</button>
          </span>
        ) : (
          canModify && (
            <span className="inline-flex items-center">
              <button type="button" onClick={onEdit} aria-label="編輯"
                className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="編輯">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={onAskDelete} aria-label="刪除"
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="刪除">
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          )
        )}
      </div>
    </div>
  );
}
