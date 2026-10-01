import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { AssetDetail } from "../../api/types";
import { CATEGORY_LABELS, STATUS_STYLE, money } from "./assetLabels";

// 帳面價值隨時間（直線法）：從取得成本斜線降到殘值，圓點標出今天
function ValueChart({ a }: { a: AssetDetail }) {
  const W = 320, H = 120, L = 52, R = 12, T = 12, B = 22;
  const life = a.lifeMonths;
  const x = (m: number) => L + (m / life) * (W - L - R);
  const y = (v: number) => T + (1 - v / a.cost) * (H - T - B);
  const now = Math.min(a.depreciatedMonths, life);
  const startYear = Number(a.acquiredDate.slice(0, 4));
  // 最後一個攤提月所在年份
  const endYear = startYear + Math.floor((Number(a.acquiredDate.slice(5, 7)) - 1 + life - 1) / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="帳面價值變化">
      <line x1={L} y1={y(a.cost)} x2={W - R} y2={y(a.cost)} stroke="#e5e7eb" />
      <line x1={L} y1={y(a.salvageValue)} x2={W - R} y2={y(a.salvageValue)} stroke="#e5e7eb" strokeDasharray="3 3" />
      <polygon
        points={`${x(0)},${y(a.cost)} ${x(life)},${y(a.salvageValue)} ${x(life)},${y(0)} ${x(0)},${y(0)}`}
        fill="#eff6ff"
      />
      <line x1={x(0)} y1={y(a.cost)} x2={x(life)} y2={y(a.salvageValue)} stroke="#2563eb" strokeWidth={2} />
      <circle cx={x(now)} cy={y(a.bookValue)} r={4.5} fill="#2563eb" stroke="#fff" strokeWidth={2} />
      <text x={L - 6} y={y(a.cost) + 3} textAnchor="end" fontSize={10} fill="#6b7280">
        {money(a.cost)}
      </text>
      <text x={L - 6} y={y(a.salvageValue) + 3} textAnchor="end" fontSize={10} fill="#6b7280">
        {money(a.salvageValue)}
      </text>
      <text x={x(0)} y={H - 6} fontSize={10} fill="#6b7280">
        {a.acquiredDate.slice(0, 7)}
      </text>
      <text x={x(life)} y={H - 6} textAnchor="end" fontSize={10} fill="#6b7280">
        {endYear}
      </text>
    </svg>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right font-mono ${strong ? "font-semibold text-gray-900" : "text-gray-700"}`}>{value}</span>
    </div>
  );
}

const inputClass = "w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

export function AssetDetailPanel({
  id,
  isAdmin,
  onEdit,
  onChanged,
  onDeleted,
}: {
  id: string;
  isAdmin: boolean;
  onEdit: (a: AssetDetail) => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [a, setA] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "settle" | "dispose" | "delete">("none");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await apiClient.get<AssetDetail>(`/assets/${id}`);
      setA(data);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(fn: () => Promise<unknown>, after: () => void = onChanged, reload = true) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode("none");
      setFormAmount("");
      setFormNote("");
      if (reload) await load();
      after();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!a) return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-400">{error ?? "載入中..."}</div>;

  const st = STATUS_STYLE[a.status];
  const loan = a.loan;
  const pct = loan && a.termCount ? Math.round((loan.paidCount / a.termCount) * 100) : 0;
  const own = a.ownership;
  const ownParts = own
    ? ([
        ["購入", a.cost, "bg-blue-600"],
        ["維修保養", own.maintenance + own.other, "bg-amber-500"],
        ["保險", own.insurance, "bg-emerald-500"],
        ["油資", own.fuel, "bg-gray-400"],
        ["停車費", own.parking, "bg-gray-300"],
      ] as const)
    : null;
  const ownTotal = ownParts ? ownParts.reduce((s, p) => s + p[1], 0) : 0;

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-800">
            {CATEGORY_LABELS[a.category]}・{a.name}
          </h3>
          {a.vehicle && <p className="text-xs text-gray-400">對應車輛 {a.vehicle.plateNumber}</p>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
      </div>

      <div>
        <Row label="取得日期" value={a.acquiredDate} />
        <Row label="總價" value={money(a.cost)} />
        <Row label="耐用年數／殘值" value={`${a.usefulLifeYears} 年／${money(a.salvageValue)}`} />
        <Row label="每月折舊" value={money(a.monthlyDepreciation)} />
        <Row label="目前帳面價值" value={money(a.bookValue)} strong />
        {a.note && <p className="mt-1 text-xs text-gray-500">備註：{a.note}</p>}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-gray-500">帳面價值</p>
        <ValueChart a={a} />
        <p className="text-[11px] text-gray-400">
          已攤提 {a.depreciatedMonths} / {a.lifeMonths} 個月，攤完後停在殘值
        </p>
      </div>

      {loan ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500">分期{a.lender ? `・${a.lender}` : ""}</p>
          <Row label="頭期款" value={money(a.downPayment)} />
          <Row label="分期金額" value={money(loan.principal)} />
          <Row
            label="每期"
            value={`${money(a.monthlyPayment ?? 0)} × ${a.termCount} 期${loan.lastAmount !== a.monthlyPayment && loan.lastAmount !== null ? `（末期 ${money(loan.lastAmount)}）` : ""}`}
          />
          <Row label="每月繳款日" value={`${a.paymentDay} 日`} />
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
            <div className={`h-full ${a.status === "LOAN" ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${a.status === "LOAN" ? pct : 100}%` }} />
          </div>
          <p className="text-sm text-gray-600">
            已繳 <span className="font-mono font-semibold">{loan.paidCount}</span> / {a.termCount} 期
            {a.status === "LOAN" && (
              <>
                ，還欠 <span className="font-mono font-semibold text-gray-900">{money(loan.remaining)}</span>，下一期 {loan.nextDueDate}{" "}
                {money(loan.nextAmount ?? 0)}，預計 {loan.lastDueDate?.slice(0, 7)} 繳完
              </>
            )}
            {a.status === "SETTLED" && `，${a.settledDate} 提前結清 ${money(a.settleAmount ?? 0)}`}
          </p>
          {Math.abs(loan.mismatch) >= (a.termCount ?? 1) && (
            <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              每期 × 期數與分期金額差 {money(Math.abs(loan.mismatch))}，請確認資料是否填對
            </p>
          )}
          <button type="button" onClick={() => setShowSchedule((v) => !v)} className="text-xs text-blue-600 hover:underline">
            {showSchedule ? "收起分期明細" : "查看每期明細"}
          </button>
          {showSchedule && (
            <div className="max-h-64 overflow-y-auto rounded-md border border-gray-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left">期</th>
                    <th className="px-2 py-1.5 text-left">繳款日</th>
                    <th className="px-2 py-1.5 text-right">金額</th>
                    <th className="px-2 py-1.5 text-right">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {a.schedule.map((s) => (
                    <tr key={s.no} className={`border-t border-gray-100 ${s.cancelled ? "text-gray-300" : ""}`}>
                      <td className="px-2 py-1">{s.no}</td>
                      <td className="px-2 py-1 font-mono">{s.dueDate}</td>
                      <td className="px-2 py-1 text-right font-mono">{money(s.amount)}</td>
                      <td className="px-2 py-1 text-right">
                        {s.cancelled ? "已結清" : s.paid ? "已繳" : "未到期"}
                        {s.imported && <span className="ml-1 text-blue-600">・已記帳</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-600">一次付清，沒有分期。</p>
      )}

      {a.status === "DISPOSED" && (
        <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {a.disposedDate} 處分，金額 {money(a.disposalAmount ?? 0)}
          {a.disposalGain !== null && (
            <span className={a.disposalGain >= 0 ? "text-green-700" : "text-red-600"}>
              ，{a.disposalGain >= 0 ? "處分利益" : "處分損失"} {money(Math.abs(a.disposalGain))}
            </span>
          )}
          {a.disposalNote && <span className="block text-xs text-gray-500">{a.disposalNote}</span>}
        </div>
      )}

      {ownParts && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-500">
            持有到現在總共花了 <span className="font-mono text-gray-800">{money(ownTotal)}</span>
          </p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
            {ownParts.map(([label, v, color]) => (
              <div key={label} className={color} style={{ width: `${ownTotal ? (v / ownTotal) * 100 : 0}%` }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
            {ownParts.map(([label, v, color]) => (
              <span key={label} className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-sm ${color}`} />
                {label} {money(v)}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">維修、保險取自維修履歷，油資與停車費取自已核准的回報（自取得日起）</p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isAdmin && mode === "none" && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <button type="button" onClick={() => onEdit(a)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50">
            編輯
          </button>
          {a.status === "LOAN" && (
            <button type="button" onClick={() => { setMode("settle"); setFormAmount(String(Math.round(loan?.remaining ?? 0))); }} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50">
              提前結清
            </button>
          )}
          {a.status === "SETTLED" && (
            <button type="button" disabled={busy} onClick={() => run(() => apiClient.delete(`/assets/${a.id}/settle`))} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50">
              取消結清
            </button>
          )}
          {a.status !== "DISPOSED" ? (
            <button type="button" onClick={() => setMode("dispose")} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50">
              處分（出售／報廢）
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => run(() => apiClient.delete(`/assets/${a.id}/dispose`))} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50">
              取消處分
            </button>
          )}
          <button type="button" onClick={() => setMode("delete")} className="ml-auto rounded-md px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
            刪除
          </button>
        </div>
      )}

      {isAdmin && (mode === "settle" || mode === "dispose") && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-700">{mode === "settle" ? "提前結清" : "處分（出售／報廢）"}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="act-date" className="mb-1 block text-xs text-gray-500">
                {mode === "settle" ? "結清日期" : "處分日期"}
              </label>
              <input id="act-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="act-amount" className="mb-1 block text-xs text-gray-500">
                {mode === "settle" ? "結清金額" : "賣出金額（報廢填 0）"}
              </label>
              <input id="act-amount" type="number" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className={inputClass} />
            </div>
          </div>
          {mode === "dispose" && (
            <input value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="備註（例：賣給車行）" aria-label="處分備註" className={inputClass} />
          )}
          <p className="text-[11px] text-gray-400">
            {mode === "settle"
              ? "結清日之後的期數不再列入應繳。結清款請另外在記帳頁記一筆「車貸」。"
              : "處分當月為最後一個折舊月，系統會算出與帳面價值的差額。"}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode("none")} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs">
              取消
            </button>
            <button
              type="button"
              disabled={busy || formAmount === ""}
              onClick={() =>
                run(() =>
                  apiClient.post(`/assets/${a.id}/${mode}`, {
                    date: formDate,
                    amount: Number(formAmount),
                    ...(mode === "dispose" ? { note: formNote.trim() || null } : {}),
                  })
                )
              }
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              確認
            </button>
          </div>
        </div>
      )}

      {isAdmin && mode === "delete" && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>確定刪除「{a.name}」的資產卡？已帶入記帳的車貸帳目會保留。賣掉或報廢請改用「處分」，才會留下紀錄。</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode("none")} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs">
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => apiClient.delete(`/assets/${a.id}`), onDeleted, false)}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              確認刪除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
