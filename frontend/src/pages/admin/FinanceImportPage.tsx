import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Import } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type {
  FinanceImportBlockStatus,
  FinanceImportCenterStatus,
  FinanceParty,
} from "../../api/types";

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

// 單一來源區塊：狀態列＋預覽清單＋關係人選擇＋帶入按鈕
function ImportBlock({
  title,
  block,
  parties,
  selectable,
  disabledReason,
  onImport,
}: {
  title: string;
  block: FinanceImportBlockStatus;
  parties: FinanceParty[];
  selectable?: boolean; // 維修履歷／薪資：逐筆勾選
  disabledReason?: string | null;
  onImport: (partyId: string, sourceIds: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState(block.defaultPartyId ?? "");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPartyId(block.defaultPartyId ?? "");
    setChecked(new Set(block.pending.map((i) => i.sourceId))); // 預設全選
  }, [block]);

  const selectedIds = selectable ? Array.from(checked) : block.pending.map((i) => i.sourceId);
  const selectedTotal = useMemo(
    () =>
      block.pending
        .filter((i) => !selectable || checked.has(i.sourceId))
        .reduce((s, i) => s + i.amount, 0),
    [block, checked, selectable]
  );

  const allImported = block.sourceCount > 0 && block.pending.length === 0;

  async function handleImport() {
    setError(null);
    if (!partyId) return setError("請選擇入帳關係人");
    if (selectedIds.length === 0) return setError("請至少勾選一筆");
    setSubmitting(true);
    try {
      await onImport(partyId, selectedIds);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {allImported && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              <CheckCircle className="h-3 w-3" />已全數帶入
            </span>
          )}
          {block.pending.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              還有 {block.pending.length} 筆未帶入
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>
            來源合計 <span className="font-semibold text-gray-800">{fmt(block.sourceTotal)}</span>
            （{block.sourceCount} 筆）
          </span>
          <span>
            已帶入 <span className="font-semibold text-gray-800">{fmt(block.importedTotal)}</span>
            （{block.importedCount} 筆）
          </span>
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-gray-100 p-4">
          {disabledReason ? (
            <p className="text-sm text-gray-400">{disabledReason}</p>
          ) : block.sourceCount === 0 ? (
            <p className="text-sm text-gray-400">本月沒有可帶入的來源紀錄</p>
          ) : (
            <>
              {/* 預覽清單 */}
              {block.pending.length > 0 ? (
                <div className="overflow-x-auto rounded border border-gray-100">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500">
                        {selectable && <th className="w-8 px-2 py-2" />}
                        <th className="px-3 py-2 text-left">日期</th>
                        <th className="px-3 py-2 text-left">摘要</th>
                        {selectable && <th className="px-3 py-2 text-left">入帳分類</th>}
                        <th className="px-3 py-2 text-left">備註</th>
                        <th className="px-3 py-2 text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {block.pending.map((i) => (
                        <tr key={i.sourceId}>
                          {selectable && (
                            <td className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={checked.has(i.sourceId)}
                                onChange={(e) => {
                                  setChecked((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(i.sourceId);
                                    else next.delete(i.sourceId);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                          )}
                          <td className="whitespace-nowrap px-3 py-2 text-gray-600">{i.date}</td>
                          <td className="px-3 py-2 text-gray-700">{i.label}</td>
                          {selectable && (
                            <td className="px-3 py-2 text-gray-500">{i.categoryName ?? "固定薪酬"}</td>
                          )}
                          <td className="max-w-[220px] truncate px-3 py-2 text-gray-400" title={i.note ?? ""}>
                            {i.note ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-gray-800">
                            {fmt(i.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-green-700">本月來源已全數帶入帳本。</p>
              )}

              {/* 帶入操作 */}
              {block.pending.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-gray-600">入帳關係人</label>
                  <select
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">請選擇</option>
                    {parties.filter((p) => p.isActive).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={submitting}
                    className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {submitting
                      ? "帶入中..."
                      : `帶入${selectable ? `勾選 ${selectedIds.length} 筆` : ""}（合計 ${fmt(selectedTotal)}）`}
                  </button>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function FinanceImportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [status, setStatus] = useState<FinanceImportCenterStatus | null>(null);
  const [parties, setParties] = useState<FinanceParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<FinanceParty[]>("/finance/parties")
      .then(({ data }) => setParties(data))
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<FinanceImportCenterStatus>("/finance/import-center", {
        params: { year, month },
      });
      setStatus(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  function goToMonth(y: number, m: number) {
    if (m < 1) { setYear(y - 1); setMonth(12); }
    else if (m > 12) { setYear(y + 1); setMonth(1); }
    else { setYear(y); setMonth(m); }
  }

  async function importSimple(endpoint: "fuel" | "parking", partyId: string) {
    await apiClient.post(`/finance/import-center/${endpoint}`, { year, month, partyId });
    await load();
  }

  async function importMaintenance(partyId: string, logIds: string[]) {
    await apiClient.post("/finance/import-center/maintenance", { year, month, partyId, logIds });
    await load();
  }

  async function importSalary(partyId: string, snapshotIds: string[]) {
    await apiClient.post("/finance/import-center/salary", { year, month, partyId, snapshotIds });
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Import className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-gray-800">帶入中心</h1>
      </div>

      <p className="text-sm text-gray-500">
        將已核准的營運資料帶入帳本。同一筆來源紀錄只能帶入一次；刪除帳目後即可重新帶入。
        帶入後來源若有變動，帳本不會自動更改，下方會顯示警告由您決定如何處理。
      </p>

      <div className="flex items-center gap-1">
        <button type="button" onClick={() => goToMonth(year, month - 1)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
        <span className="flex items-center rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700">
          {year} 年 {month} 月
        </span>
        <button type="button" onClick={() => goToMonth(year, month + 1)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 來源不一致警告 */}
      {status && status.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            與來源不一致（{status.warnings.length} 筆）
          </div>
          <ul className="space-y-1 text-sm text-amber-700">
            {status.warnings.map((w, i) => (
              <li key={i}>
                {w.sourceLabel ?? w.recordNote ?? w.recordId}：{w.message}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-600">
            帳本金額以帶入當下為準。若要更新，請至記帳頁編輯該筆帳目，或刪除後重新帶入。
          </p>
        </div>
      )}

      {loading || !status ? (
        <p className="text-sm text-gray-400">載入中...</p>
      ) : (
        <div className="space-y-3">
          <ImportBlock
            title="已核准加油回報 →（支出／油資）"
            block={status.fuel}
            parties={parties}
            onImport={(partyId) => importSimple("fuel", partyId)}
          />
          <ImportBlock
            title="已核准停車費回報 →（支出／停車費）"
            block={status.parking}
            parties={parties}
            onImport={(partyId) => importSimple("parking", partyId)}
          />
          <ImportBlock
            title="車輛維修履歷 →（支出／維修・保險・雜支）"
            block={status.maintenance}
            parties={parties}
            selectable
            onImport={importMaintenance}
          />
          <ImportBlock
            title="薪資封存快照 →（支出／固定薪酬，一人一筆）"
            block={status.salary}
            parties={parties}
            selectable
            disabledReason={
              status.salary.extra?.monthLocked
                ? null
                : "該月份薪資尚未封存。請先於「薪資計算」頁完成封存，再回到此處帶入。"
            }
            onImport={importSalary}
          />
          <p className="text-xs text-gray-400">
            說明：加油與停車費回報會彙總為一筆帳目（備註載明筆數），薪資扣除油資／停車費補貼後帶入（一人一筆），
            維修履歷逐筆帶入並依類別對應分類。帶入後若又有新核准的紀錄，區塊會顯示「還有 N 筆未帶入」，可補帶入為新的一筆帳。
          </p>
        </div>
      )}
    </div>
  );
}
