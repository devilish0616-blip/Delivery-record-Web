import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { AssetItem, AssetStatus, AssetsResponse } from "../../api/types";
import { AssetDetailPanel } from "./AssetDetailPanel";
import { AssetFormModal } from "./AssetFormModal";
import { CATEGORY_LABELS, STATUS_STYLE, money } from "./assetLabels";

type Filter = "all" | "loan" | "done" | "cash" | "disposed";
const FILTERS: { key: Filter; label: string; match: (s: AssetStatus) => boolean }[] = [
  { key: "all", label: "持有中", match: (s) => s !== "DISPOSED" },
  { key: "loan", label: "繳款中", match: (s) => s === "LOAN" },
  { key: "done", label: "已繳清", match: (s) => s === "PAID" || s === "SETTLED" },
  { key: "cash", label: "一次付清", match: (s) => s === "CASH" },
  { key: "disposed", label: "已處分", match: (s) => s === "DISPOSED" },
];

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg border p-3.5 ${accent ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold ${accent ? "text-blue-700" : "text-gray-800"}`}>{value}</p>
      <p className="text-[11px] text-gray-400">{hint}</p>
    </div>
  );
}

// 資產清單：總覽數字＋狀態篩選＋清單，點一筆在右側看明細
export function AssetListPanel({
  isAdmin,
  creating,
  onCreateClose,
}: {
  isAdmin: boolean;
  creating: boolean;
  onCreateClose: () => void;
}) {
  const [data, setData] = useState<AssetsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AssetItem | null | "new">(null);
  const [detailKey, setDetailKey] = useState(0);

  async function load() {
    try {
      const { data } = await apiClient.get<AssetsResponse>("/assets");
      setData(data);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!data) return <p className="text-sm text-gray-500">{error ?? "載入中..."}</p>;

  const f = FILTERS.find((x) => x.key === filter)!;
  const list = data.assets.filter((a) => f.match(a.status));
  const selected = selectedId && data.assets.some((a) => a.id === selectedId) ? selectedId : list[0]?.id ?? null;
  const s = data.summary;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="資產總價" value={money(s.totalCost)} hint={`持有中 ${s.count} 項`} />
        <Kpi label="目前帳面價值" value={money(s.bookValue)} hint={`累計折舊 ${money(s.totalCost - s.bookValue)}`} />
        <Kpi label="還欠分期" value={money(s.loanRemaining)} hint={`${s.loanActiveCount} 筆繳款中・零利率`} accent />
        <Kpi label="淨資產" value={money(s.bookValue - s.loanRemaining)} hint="帳面價值 − 還欠分期" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((x) => {
          const n = data.assets.filter((a) => x.match(a.status)).length;
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => setFilter(x.key)}
              className={`rounded-full border px-3 py-1 text-xs ${
                filter === x.key ? "border-blue-600 bg-blue-50 font-semibold text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {x.label} {n}
            </button>
          );
        })}
      </div>

      {data.assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          還沒有任何資產卡。{isAdmin ? "按右上角「新增資產」，從現有的車輛開始補登買價與分期。" : ""}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <ul className="space-y-2">
            {list.length === 0 && <li className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-400">這個分類沒有資產</li>}
            {list.map((a) => {
              const st = STATUS_STYLE[a.status];
              const pct = a.loan && a.termCount ? Math.round((a.loan.paidCount / a.termCount) * 100) : 0;
              const active = a.id === selected;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={`grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-white px-3 py-2.5 text-left transition-colors ${
                      active ? "border-blue-600 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500">
                      {CATEGORY_LABELS[a.category]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-gray-800">{a.name}</span>
                      <span className="block text-xs text-gray-500">
                        {a.acquiredDate.slice(0, 7)} 取得・總價 <span className="font-mono">{money(a.cost)}</span>
                      </span>
                    </span>
                    <span className="grid justify-items-end gap-1">
                      <span className="font-mono text-sm font-semibold text-gray-800">{money(a.bookValue)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.className}`}>
                        {a.status === "LOAN" ? `繳款中 ${a.loan?.paidCount}/${a.termCount}` : st.label}
                      </span>
                      {a.status === "LOAN" && (
                        <span className="h-1 w-24 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                          <span className="block h-full bg-amber-500" style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && (
            <div className="lg:sticky lg:top-4">
              <AssetDetailPanel
                key={`${selected}-${detailKey}`}
                id={selected}
                isAdmin={isAdmin}
                onEdit={(a) => setEditing(a)}
                onChanged={load}
                onDeleted={() => {
                  setSelectedId(null);
                  load();
                }}
              />
            </div>
          )}
        </div>
      )}

      {(editing || creating) && (
        <AssetFormModal
          asset={editing && editing !== "new" ? editing : null}
          onClose={() => {
            setEditing(null);
            onCreateClose();
          }}
          onSaved={async (id) => {
            setEditing(null);
            onCreateClose();
            setSelectedId(id);
            setDetailKey((k) => k + 1);
            await load();
          }}
        />
      )}
    </div>
  );
}
