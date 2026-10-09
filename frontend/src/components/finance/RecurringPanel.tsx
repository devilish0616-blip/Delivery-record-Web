import { useEffect, useState } from "react";
import { CalendarClock, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { FinanceCategory, FinanceParty } from "../../api/types";

type State = "applied" | "skipped" | "due" | "upcoming";

interface RecurringItem {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  dayOfMonth: number;
  note: string | null;
  isActive: boolean;
  party: { id: string; name: string };
  category: { id: string; name: string };
  dueDate: string;
  state: State;
  recordId: string | null;
}

interface Draft {
  id?: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  partyId: string;
  categoryId: string;
  amount: string;
  dayOfMonth: string;
  note: string;
  isActive: boolean;
}

const STATE_CHIP: Record<State, { label: string; cls: string }> = {
  applied: { label: "已記", cls: "bg-green-50 text-green-700" },
  skipped: { label: "這個月不用", cls: "bg-gray-100 text-gray-500" },
  due: { label: "還沒記", cls: "bg-amber-100 text-amber-800" },
  upcoming: { label: "還沒到", cls: "bg-blue-50 text-blue-700" },
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const inputCls = "h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-blue-500 focus:outline-none";

// 記帳頁「固定收支」：房租、電話、保險、會計費這類每月固定的帳，存成範本後每月一鍵帶入；
// 每個範本每月只帶一次，帳目刪掉後可以再帶；這個月沒付可以標「這個月不用」
export function RecurringPanel({
  year,
  month,
  parties,
  categories,
  defaultOpen,
  onApplied,
}: {
  year: number;
  month: number;
  parties: FinanceParty[];
  categories: FinanceCategory[];
  defaultOpen?: boolean;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const key = `${year}-${month}`;

  async function reload() {
    try {
      const { data } = await apiClient.get<RecurringItem[]>("/finance/recurring", { params: { year, month } });
      setItems(data);
      setLoadedKey(key);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    let active = true;
    apiClient
      .get<RecurringItem[]>("/finance/recurring", { params: { year, month } })
      .then(({ data }) => {
        if (!active) return;
        setItems(data);
        setLoadedKey(`${year}-${month}`);
      })
      .catch((err) => active && setError(getErrorMessage(err)));
    return () => {
      active = false;
    };
  }, [year, month]);

  async function run(action: () => Promise<unknown>, appliedRecords = false) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      if (appliedRecords) onApplied();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    const type = "EXPENSE" as const;
    setDraft({
      name: "",
      type,
      partyId: parties.find((p) => p.isActive)?.id ?? "",
      categoryId: categories.find((c) => c.isActive && c.kind === type)?.id ?? "",
      amount: "",
      dayOfMonth: "5",
      note: "",
      isActive: true,
    });
  }

  function startEdit(i: RecurringItem) {
    setDraft({
      id: i.id,
      name: i.name,
      type: i.type,
      partyId: i.party.id,
      categoryId: i.category.id,
      amount: String(i.amount),
      dayOfMonth: String(i.dayOfMonth),
      note: i.note ?? "",
      isActive: i.isActive,
    });
  }

  async function saveDraft() {
    if (!draft) return;
    const body = {
      name: draft.name.trim(),
      type: draft.type,
      partyId: draft.partyId,
      categoryId: draft.categoryId,
      amount: Number(draft.amount),
      dayOfMonth: Number(draft.dayOfMonth),
      note: draft.note.trim() || null,
      isActive: draft.isActive,
    };
    if (!body.name) return setError("請輸入名稱");
    if (!(body.amount > 0)) return setError("金額必須大於 0");
    await run(async () => {
      if (draft.id) await apiClient.put(`/finance/recurring/${draft.id}`, body);
      else await apiClient.post("/finance/recurring", body);
      setDraft(null);
    });
  }

  const due = items.filter((i) => i.isActive && i.state === "due");
  const loading = loadedKey !== key;

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <CalendarClock className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">固定收支</span>
        <span className="text-xs text-gray-500">房租、電話、保險這類每月固定的帳</span>
        {due.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{month} 月還有 {due.length} 筆沒記</span>
        )}
        <ChevronDown className={`ml-auto h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-gray-100 px-4 py-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading ? (
            <p className="text-sm text-gray-500">載入中...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-500">還沒有固定收支範本，按下面「新增」建一筆，例如每月 5 號付房租。</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {items.map((i) => (
                <li key={i.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${i.isActive ? "" : "opacity-50"}`}>
                  <span className="min-w-[7rem] font-medium text-gray-800">{i.name}</span>
                  <span className="text-xs text-gray-500">
                    每月 {i.dayOfMonth} 號・{i.type === "INCOME" ? "收入" : "支出"}・{i.category.name}・{i.party.name}
                  </span>
                  <span className={`font-mono text-sm ${i.type === "INCOME" ? "text-green-700" : "text-gray-800"}`}>{money(i.amount)}</span>
                  <span className="flex-1" />
                  {i.isActive ? (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATE_CHIP[i.state].cls}`}>{STATE_CHIP[i.state].label}</span>
                  ) : (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">停用</span>
                  )}
                  {i.isActive && (i.state === "due" || i.state === "upcoming") && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => apiClient.post("/finance/recurring/apply", { year, month, ids: [i.id] }), true)}
                        className="rounded-md border border-blue-200 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                      >
                        帶入
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => apiClient.post(`/finance/recurring/${i.id}/skip`, { year, month }))}
                        className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                      >
                        這個月不用
                      </button>
                    </>
                  )}
                  {i.state === "skipped" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => apiClient.delete(`/finance/recurring/${i.id}/skip/${year}/${month}`))}
                      className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                    >
                      取消不用
                    </button>
                  )}
                  <button type="button" aria-label={`編輯 ${i.name}`} onClick={() => startEdit(i)} className="rounded p-1 text-gray-400 hover:text-blue-600">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`刪除 ${i.name}`}
                    onClick={() => {
                      if (window.confirm(`刪除「${i.name}」範本？已經帶入的帳目會保留。`)) run(() => apiClient.delete(`/finance/recurring/${i.id}`));
                    }}
                    className="rounded p-1 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {due.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => apiClient.post("/finance/recurring/apply", { year, month, ids: due.map((d) => d.id) }), true)}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                帶入 {month} 月還沒記的 {due.length} 筆（{money(due.reduce((s, d) => s + d.amount, 0))}）
              </button>
            )}
            {!draft && (
              <button
                type="button"
                onClick={startNew}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" />
                新增固定收支
              </button>
            )}
          </div>

          {draft && (
            <div className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-3">
              <label className="text-xs text-gray-600 sm:col-span-2">
                名稱
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如：辦公室房租" className={inputCls} />
              </label>
              <label className="text-xs text-gray-600">
                收入／支出
                <select
                  value={draft.type}
                  onChange={(e) => {
                    const type = e.target.value as Draft["type"];
                    setDraft({ ...draft, type, categoryId: categories.find((c) => c.isActive && c.kind === type)?.id ?? "" });
                  }}
                  className={inputCls}
                >
                  <option value="EXPENSE">支出</option>
                  <option value="INCOME">收入</option>
                </select>
              </label>
              <label className="text-xs text-gray-600">
                分類
                <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} className={inputCls}>
                  {categories
                    .filter((c) => c.kind === draft.type && (c.isActive || c.id === draft.categoryId))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                關係人（誰付／誰收）
                <select value={draft.partyId} onChange={(e) => setDraft({ ...draft, partyId: e.target.value })} className={inputCls}>
                  {parties
                    .filter((p) => p.isActive || p.id === draft.partyId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                金額
                <input inputMode="numeric" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^\d.]/g, "") })} className={inputCls} />
              </label>
              <label className="text-xs text-gray-600">
                每月幾號（帳目日期）
                <input inputMode="numeric" value={draft.dayOfMonth} onChange={(e) => setDraft({ ...draft, dayOfMonth: e.target.value.replace(/\D/g, "") })} className={inputCls} />
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                備註（選填，會帶進帳目）
                <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={inputCls} />
              </label>
              <label className="flex items-center gap-2 self-end text-xs text-gray-600">
                <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4 accent-blue-600" />
                啟用
              </label>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <button type="button" onClick={() => setDraft(null)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  取消
                </button>
                <button type="button" disabled={busy} onClick={saveDraft} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {draft.id ? "儲存" : "新增"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
