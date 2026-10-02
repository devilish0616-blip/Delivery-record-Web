import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { AuditCategory, AuditLogItem, AuditLogPage, User } from "../../api/types";

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  DELIVERY: "送件與里程",
  SALARY: "薪資",
  FINANCE: "記帳",
  REVIEW: "審核",
  EMPLOYEE: "員工與權限",
  SETTINGS: "設定",
  ASSET: "資產",
};

const CATEGORY_STYLE: Record<AuditCategory, string> = {
  DELIVERY: "bg-blue-50 text-blue-700",
  SALARY: "bg-violet-50 text-violet-700",
  FINANCE: "bg-emerald-50 text-emerald-700",
  REVIEW: "bg-amber-50 text-amber-800",
  EMPLOYEE: "bg-gray-100 text-gray-700",
  SETTINGS: "bg-gray-100 text-gray-700",
  ASSET: "bg-sky-50 text-sky-700",
};

function when(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function show(v: string | number | boolean | null) {
  if (v === null) return "（無）";
  if (typeof v === "boolean") return v ? "是" : "否";
  return String(v);
}

interface Filters {
  category: string;
  userId: string;
  from: string;
  to: string;
  q: string;
}

const EMPTY: Filters = { category: "", userId: "", from: "", to: "", q: "" };

// 系統設定「操作紀錄」（董事長）：誰、什麼時候、改了誰的什麼、改前改後
export function AuditLogPanel() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<Filters | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loading = loadedFor !== filters;

  useEffect(() => {
    apiClient
      .get<User[]>("/employees")
      .then(({ data }) => setEmployees(data))
      .catch(() => setEmployees([]));
  }, []);

  function params(f: Filters, after?: string | null) {
    return {
      ...(f.category ? { category: f.category } : {}),
      ...(f.userId ? { userId: f.userId } : {}),
      ...(f.from ? { from: f.from } : {}),
      ...(f.to ? { to: f.to } : {}),
      ...(f.q.trim() ? { q: f.q.trim() } : {}),
      ...(after ? { cursor: after } : {}),
    };
  }

  useEffect(() => {
    let active = true;
    apiClient
      .get<AuditLogPage>("/audit-logs", { params: params(filters) })
      .then(({ data }) => {
        if (!active) return;
        setItems(data.items);
        setCursor(data.nextCursor);
        setError(null);
      })
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoadedFor(filters));
    return () => {
      active = false;
    };
  }, [filters]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const { data } = await apiClient.get<AuditLogPage>("/audit-logs", { params: params(filters, cursor) });
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  function apply(e: FormEvent) {
    e.preventDefault();
    setFilters({ ...draft });
  }

  const inputClass = "rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        送件件數、里程、薪資（扣款、封存、職等）、帳目、審核結果、員工帳號與權限、收入單價與資產被新增、修改或刪除時都會記一筆。員工第一次填自己的送件不記，之後自己改才記。
      </p>

      <form onSubmit={apply} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          分類
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputClass}>
            <option value="">全部</option>
            {(Object.keys(CATEGORY_LABEL) as AuditCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          員工（做的或被改的）
          <select value={draft.userId} onChange={(e) => setDraft({ ...draft, userId: e.target.value })} className={inputClass}>
            <option value="">全部</option>
            {employees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.isActive ? "" : "（停用）"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          從
          <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          到
          <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputClass} />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-gray-500">
          關鍵字
          <input
            type="text"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            placeholder="例如：9/28、扣款、核准"
            className={inputClass}
          />
        </label>
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          查詢
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY);
            setFilters(EMPTY);
          }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          清除
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && items.length === 0 ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">沒有符合的紀錄</p>
      ) : (
        <ul className={`divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm ${loading ? "opacity-60" : ""}`}>
          {items.map((it) => (
            <li key={it.id} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span className="font-mono">{when(it.createdAt)}</span>
                <span className={`rounded px-1.5 py-0.5 ${CATEGORY_STYLE[it.category] ?? "bg-gray-100 text-gray-700"}`}>
                  {CATEGORY_LABEL[it.category] ?? it.category}
                </span>
                <span>
                  <span className="font-medium text-gray-700">{it.actorName}</span>
                  {it.targetName && it.targetUserId !== it.actorId && (
                    <>
                      {" "}
                      → <span className="font-medium text-gray-700">{it.targetName}</span>
                    </>
                  )}
                </span>
              </div>
              <p className="text-sm text-gray-900">{it.summary}</p>
              {it.changes && it.changes.length > 0 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
                  {it.changes.map((c, i) => (
                    <li key={i}>
                      {c.label}：<span className="text-gray-400 line-through decoration-gray-300">{show(c.from)}</span>
                      {" → "}
                      <span className="font-medium text-gray-800">{show(c.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <div className="text-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={loadMore}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          >
            {loadingMore ? "載入中..." : "載入更多"}
          </button>
        </div>
      )}
    </div>
  );
}
