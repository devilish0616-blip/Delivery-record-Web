import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { apiClient, getErrorMessage } from "../api/client";
import type { DailyRoleType, ProxyDeliveryDay } from "../api/types";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const ROLE_OPTIONS: { key: DailyRoleType; label: string }[] = [
  { key: "NONE", label: "一般" },
  { key: "TRUCK_DRIVER", label: "司機" },
  { key: "TRUCK_ATTENDANT", label: "隨車" },
];

interface Draft {
  role: DailyRoleType;
  fwd: string;
  rev: string;
  note: string;
  dirty: boolean;
}

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(date: string): { md: string; wd: string } {
  const d = new Date(`${date}T00:00:00Z`);
  return { md: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, wd: WEEKDAYS[d.getUTCDay()] };
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function draftsFrom(data: ProxyDeliveryDay): Record<string, Draft> {
  return Object.fromEntries(
    data.entries.map((e) => [
      e.userId,
      {
        role: e.role,
        fwd: e.record ? String(e.record.forwardCount) : "",
        rev: e.record ? String(e.record.reverseCount) : "",
        note: e.record?.note ?? "",
        dirty: false,
      },
    ])
  );
}

// 代填送件：董事長／執行長一次替多位（代管）員工填寫當日角色與件數
export function ProxyDeliveryPanel({ isAdmin, initialDate }: { isAdmin: boolean; initialDate?: string }) {
  const today = localToday();
  const [date, setDate] = useState(initialDate && initialDate <= today ? initialDate : today);
  const [scope, setScope] = useState<"managed" | "all">("managed");
  const [data, setData] = useState<ProxyDeliveryDay | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await apiClient.get<ProxyDeliveryDay>("/deliveries/proxy", { params: { date, scope } });
      setData(data);
      setDrafts(draftsFrom(data));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [date, scope]);

  useEffect(() => {
    setLoading(true);
    setMessage(null);
    load();
  }, [load]);

  const dirtyIds = useMemo(() => Object.keys(drafts).filter((id) => drafts[id].dirty), [drafts]);

  // 有未儲存的修改時，切換日期／範圍前先確認
  function guard(action: () => void) {
    if (dirtyIds.length > 0 && !window.confirm(`有 ${dirtyIds.length} 人的資料尚未儲存，確定要離開？`)) return;
    action();
  }

  function update(userId: string, patch: Partial<Draft>) {
    setMessage(null);
    setDrafts((d) => ({ ...d, [userId]: { ...d[userId], ...patch, dirty: true } }));
  }

  async function copyPrevRoles() {
    try {
      const { data: prev } = await apiClient.get<ProxyDeliveryDay>("/deliveries/proxy", {
        params: { date: shiftDate(date, -1), scope },
      });
      const prevRole = new Map(prev.entries.map((e) => [e.userId, e.role]));
      // 只帶入角色、不標記為已修改：未填件數的人不會因此被存成 0 件
      setDrafts((d) =>
        Object.fromEntries(
          Object.entries(d).map(([id, draft]) => [id, { ...draft, role: prevRole.get(id) ?? draft.role }])
        )
      );
      setMessage("已帶入前一天的角色（填寫件數後一起儲存）");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function save() {
    if (dirtyIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const entries = dirtyIds.map((userId) => {
        const d = drafts[userId];
        return {
          userId,
          role: d.role,
          forwardCount: Math.max(0, Math.floor(Number(d.fwd) || 0)),
          reverseCount: Math.max(0, Math.floor(Number(d.rev) || 0)),
          note: d.note.trim() || null,
        };
      });
      await apiClient.post("/deliveries/proxy", { date, entries });
      await load();
      setMessage(`已儲存 ${entries.length} 人的送件紀錄`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Enter 跳到下一個輸入格，最後一格按 Enter 直接儲存
  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-proxy-input]"));
    const idx = inputs.indexOf(e.currentTarget);
    if (idx >= 0 && idx < inputs.length - 1) inputs[idx + 1].focus();
    else save();
  }

  const unfilled = data ? data.entries.filter((e) => !e.record).length : 0;
  const cols = "md:grid-cols-[minmax(150px,1.2fr)_200px_100px_100px_60px_minmax(120px,1fr)_150px]";
  const numInput =
    "h-11 w-full rounded-lg border border-gray-300 px-3 text-right font-mono text-lg font-semibold focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {/* 週條 */}
      <section className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          aria-label="上一週"
          onClick={() => guard(() => setDate(shiftDate(date, -7)))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1.5">
          {(data?.week ?? []).map((w) => {
            const { md, wd } = dayLabel(w.date);
            const future = w.date > today;
            const selected = w.date === date;
            const full = data!.total > 0 && w.filled >= data!.total;
            return (
              <button
                key={w.date}
                type="button"
                disabled={future}
                onClick={() => guard(() => setDate(w.date))}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 disabled:opacity-40 ${
                  selected ? "border-2 border-blue-600 bg-blue-50 text-blue-700" : "border border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <span className="text-[11px] opacity-80">{wd}</span>
                <span className="font-mono text-sm font-semibold">
                  <span className="sm:hidden">{md.split("/")[1]}</span>
                  <span className="hidden sm:inline">{md}</span>
                </span>
                {!future && data!.total > 0 && (
                  <span className={`h-1.5 w-1.5 rounded-full sm:hidden ${full ? "bg-green-600" : "bg-amber-500"}`} />
                )}
                {!future && data!.total > 0 && (
                  <span
                    className={`hidden rounded-full px-1.5 text-[10px] sm:block ${
                      full ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {full ? `已填 ${w.filled}/${data!.total}` : `未填 ${data!.total - w.filled}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="下一週"
          disabled={(data?.week[6]?.date ?? today) >= today}
          onClick={() => guard(() => setDate(shiftDate(date, 7) > today ? today : shiftDate(date, 7)))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">
            {dayLabel(date).md}（{dayLabel(date).wd}）代填
            {unfilled > 0 && <span className="ml-2 text-xs font-normal text-red-700">{unfilled} 人未填</span>}
          </h2>
          {isAdmin && (
            <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
              {(
                [
                  ["managed", "代管帳號"],
                  ["all", "全部員工"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => guard(() => setScope(k))}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    scope === k ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={copyPrevRoles}
            disabled={!data || data.entries.length === 0}
            className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            帶入前一天角色
          </button>
        </div>

        {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}

        {loading || !data ? (
          <p className="p-4 text-sm text-gray-500">載入中...</p>
        ) : data.entries.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">
            目前沒有代管帳號。請到「員工管理」點選員工，開啟「代管帳號」。
          </p>
        ) : (
          <>
            <div className={`hidden gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500 md:grid ${cols}`}>
              <div>員工</div>
              <div>今日角色</div>
              <div className="text-right">正物流</div>
              <div className="text-right">逆物流</div>
              <div className="text-right">小計</div>
              <div>備註</div>
              <div>狀態</div>
            </div>
            {data.entries.map((e) => {
              const d = drafts[e.userId];
              if (!d) return null;
              const total = (Number(d.fwd) || 0) + (Number(d.rev) || 0);
              return (
                <div
                  key={e.userId}
                  className={`grid grid-cols-2 items-center gap-2 border-b border-gray-100 px-4 py-3 md:gap-3 ${cols} ${
                    d.dirty ? "bg-blue-50/40" : !e.record ? "bg-red-50/50" : ""
                  }`}
                >
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-base font-semibold text-gray-900">{e.name}</span>
                      {e.isProxyManaged && (
                        <span className="shrink-0 rounded bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-800">代管</span>
                      )}
                    </div>
                    {e.accountNote && <div className="truncate text-xs text-gray-500" title={e.accountNote}>{e.accountNote}</div>}
                  </div>
                  <div className="col-span-2 grid grid-cols-3 gap-0.5 rounded-lg bg-gray-100 p-0.5 md:col-span-1">
                    {ROLE_OPTIONS.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => update(e.userId, { role: o.key })}
                        className={`h-9 rounded-md text-sm ${
                          d.role === o.key ? "bg-white font-semibold text-blue-700 shadow-sm" : "text-gray-600"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <label className="text-xs text-gray-500 md:text-[0px]">
                    <span className="md:hidden">正物流</span>
                    <input
                      data-proxy-input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={d.fwd}
                      placeholder="0"
                      aria-label={`${e.name} 正物流`}
                      onChange={(ev) => update(e.userId, { fwd: ev.target.value })}
                      onKeyDown={onEnter}
                      onFocus={(ev) => ev.target.select()}
                      className={numInput}
                    />
                  </label>
                  <label className="text-xs text-gray-500 md:text-[0px]">
                    <span className="md:hidden">逆物流</span>
                    <input
                      data-proxy-input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={d.rev}
                      placeholder="0"
                      aria-label={`${e.name} 逆物流`}
                      onChange={(ev) => update(e.userId, { rev: ev.target.value })}
                      onKeyDown={onEnter}
                      onFocus={(ev) => ev.target.select()}
                      className={numInput}
                    />
                  </label>
                  <div className="hidden text-right font-mono text-base font-semibold text-gray-800 md:block">
                    {d.fwd === "" && d.rev === "" ? "—" : total}
                  </div>
                  <input
                    type="text"
                    value={d.note}
                    placeholder="備註（選填）"
                    aria-label={`${e.name} 備註`}
                    onChange={(ev) => update(e.userId, { note: ev.target.value })}
                    className="col-span-2 h-11 rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none md:col-span-1"
                  />
                  <div className="col-span-2 text-xs md:col-span-1">
                    {d.dirty ? (
                      <span className="font-semibold text-blue-700">已修改・尚未儲存</span>
                    ) : e.record ? (
                      <span className="inline-flex items-center gap-1 text-green-700">
                        <Check className="h-3.5 w-3.5" />
                        {e.record.enteredByName ? `${e.record.enteredByName} 代填` : "本人填寫"}・{timeLabel(e.record.updatedAt)}
                      </span>
                    ) : (
                      <span className="font-semibold text-red-700">未填寫</span>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50/95 px-4 py-3 backdrop-blur">
              <span className="hidden text-xs text-gray-500 sm:inline">按 Enter 跳到下一格・空白的件數視為 0</span>
              {message && <span className="text-sm text-green-700">{message}</span>}
              <span className="ml-auto text-sm text-blue-800">{dirtyIds.length > 0 && `${dirtyIds.length} 人有變更`}</span>
              <button
                type="button"
                onClick={save}
                disabled={saving || dirtyIds.length === 0}
                className="h-11 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "儲存中..." : "全部儲存"}
              </button>
            </div>
          </>
        )}
      </section>
      <p className="text-xs text-gray-500">
        每筆代填都會記錄代填者與時間，本人登入時也看得到。{isAdmin
          ? "董事長可代填所有人；執行長與具「代填送件」職務權限的人只能代填代管帳號。"
          : "您只能代填代管帳號。"}
      </p>
    </div>
  );
}
