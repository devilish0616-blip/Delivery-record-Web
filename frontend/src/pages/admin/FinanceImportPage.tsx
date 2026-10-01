import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle, Import, Zap } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { YearMonthPicker } from "../../components/YearMonthPicker";
import type {
  FinanceImportBlockStatus,
  FinanceImportCenterStatus,
  FinanceMonthImportSummary,
  FinanceParty,
  FinanceQuickImportBlockResult,
  FinanceQuickImportPreview,
  FinanceQuickImportResult,
  FinanceSourceType,
} from "../../api/types";

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function partyName(parties: FinanceParty[], partyId: string | null | undefined): string {
  if (!partyId) return "未指定";
  return parties.find((p) => p.id === partyId)?.name ?? "未知關係人";
}

// 各來源帶入後的分類（維修依履歷類別另外對應，見 item.categoryName）
const CATEGORY_BY_SOURCE: Partial<Record<FinanceSourceType, string>> = {
  FUEL_REPORT: "油資",
  PARKING_FEE_REPORT: "停車費",
  SALARY_SNAPSHOT: "固定薪酬",
};

// 單一來源區塊：狀態列＋預覽清單＋關係人選擇＋帶入按鈕
function ImportBlock({
  id,
  title,
  subtitle,
  open,
  onToggle,
  sourceType,
  block,
  parties,
  selectable,
  groupable,
  disabledReason,
  onImport,
  onReload,
}: {
  id: string;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  sourceType: FinanceSourceType;
  block: FinanceImportBlockStatus;
  parties: FinanceParty[];
  selectable?: boolean; // 維修履歷／薪資：逐筆勾選
  groupable?: boolean; // 加油／停車費／薪資：每筆可各自指定負責關係人（預設帶入員工指派值）
  disabledReason?: string | null;
  onImport: (partyId: string, sourceIds: string[], partyOverrides?: Record<string, string>) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [partyId, setPartyId] = useState(block.defaultPartyId ?? "");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [bulkPartyId, setBulkPartyId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  // 「不帶入」改為在清單中直接填原因（取代瀏覽器 prompt）
  const [ignoreDraft, setIgnoreDraft] = useState<{ id: string; reason: string } | null>(null);

  useEffect(() => {
    setPartyId(block.defaultPartyId ?? "");
    setChecked(new Set(block.pending.map((i) => i.sourceId))); // 預設全選
    setOverrides(new Map());
  }, [block]);

  // 單筆關係人：使用者手動改過的值優先，否則用員工指派解析出的預設值
  function effectiveParty(item: (typeof block.pending)[number]): string | null {
    // 與後端一致：手動覆蓋 → 員工指派的負責人 → 帳務設定的全域預設
    return overrides.get(item.sourceId) ?? item.resolvedPartyId ?? block.defaultPartyId ?? null;
  }
  function setItemParty(sourceId: string, value: string) {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (value) next.set(sourceId, value);
      else next.delete(sourceId);
      return next;
    });
  }
  function applyBulkToUnassigned() {
    if (!bulkPartyId) return;
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const i of block.pending) {
        if (!effectiveParty(i)) next.set(i.sourceId, bulkPartyId);
      }
      return next;
    });
  }

  const selectedIds = selectable ? Array.from(checked) : block.pending.map((i) => i.sourceId);
  const relevantItems = useMemo(
    () => block.pending.filter((i) => !selectable || checked.has(i.sourceId)),
    [block, checked, selectable]
  );
  const selectedTotal = useMemo(() => relevantItems.reduce((s, i) => s + i.amount, 0), [relevantItems]);

  // 依每筆目前的關係人（手動覆蓋或員工指派值）分組，供帶入前預覽將建立幾筆帳目
  const groupSummary = useMemo(() => {
    if (!groupable) return [];
    const map = new Map<string, { partyId: string | null; count: number; total: number }>();
    for (const i of relevantItems) {
      const p = effectiveParty(i);
      const key = p ?? "__unassigned__";
      const g = map.get(key) ?? { partyId: p, count: 0, total: 0 };
      g.count += 1;
      g.total += i.amount;
      map.set(key, g);
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantItems, groupable, overrides]);
  const hasUnassigned = groupable ? relevantItems.some((i) => !effectiveParty(i)) : false;

  // 三態徽章：pending 已扣除「已帶入」與「已略過」，兩者剩 0 筆時要分清楚是「真的全帶入」還是「全略過、零帶入」
  const nothingPending = block.sourceCount > 0 && block.pending.length === 0;
  const allImported = nothingPending && block.importedCount === block.sourceCount;
  const allIgnoredNoneImported =
    nothingPending && block.importedCount === 0 && block.ignored.length === block.sourceCount;
  const mixedResolved = nothingPending && !allImported && !allIgnoredNoneImported;

  async function handleImport() {
    setError(null);
    if (groupable) {
      if (hasUnassigned) return setError("還有項目尚未指定關係人，請逐筆選擇或使用下方「批次套用」");
    } else if (!partyId) {
      return setError("請選擇入帳關係人");
    }
    if (selectedIds.length === 0) return setError("請至少勾選一筆");
    setSubmitting(true);
    try {
      const partyOverrides = groupable
        ? Object.fromEntries(relevantItems.map((i) => [i.sourceId, effectiveParty(i)!]))
        : undefined;
      await onImport(partyId, selectedIds, partyOverrides);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // 標記「不帶入」：之後不再出現於待帶入清單，不需要每次重新勾掉
  async function handleIgnore(sourceId: string, reason: string) {
    setError(null);
    setIgnoringId(sourceId);
    try {
      await apiClient.post("/finance/import-center/ignore", {
        sourceType,
        sourceId,
        reason: reason.trim() || undefined,
      });
      setIgnoreDraft(null);
      await onReload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIgnoringId(null);
    }
  }

  async function handleUnignore(sourceId: string) {
    setError(null);
    setIgnoringId(sourceId);
    try {
      await apiClient.delete(`/finance/import-center/ignore/${sourceType}/${sourceId}`);
      await onReload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIgnoringId(null);
    }
  }

  function toggleAll(next: boolean) {
    setChecked(next ? new Set(block.pending.map((i) => i.sourceId)) : new Set());
  }

  return (
    <div id={id} className={`scroll-mt-4 rounded-xl border bg-white shadow-sm ${open ? "border-blue-300" : "border-gray-200"}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-gray-900">{title}</span>
          {allImported && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              <CheckCircle className="h-3 w-3" />已全數帶入
            </span>
          )}
          {allIgnoredNoneImported && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              本月來源已略過
            </span>
          )}
          {mixedResolved && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
              已帶入 {block.importedCount} 筆／略過 {block.ignored.length} 筆
            </span>
          )}
          {block.pending.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              待帶入 {block.pending.length} 筆
            </span>
          )}
          {disabledReason && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">尚未封存</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="hidden sm:inline">
            來源 <span className="font-mono font-semibold text-gray-800">{fmt(block.sourceTotal)}</span>
            （{block.sourceCount} 筆）
          </span>
          <span>
            已帶入 <span className="font-mono font-semibold text-gray-800">{fmt(block.importedTotal)}</span>
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
                        {selectable && (
                          <th className="w-8 px-2 py-2">
                            <input
                              type="checkbox"
                              title="全選／取消全選"
                              ref={(el) => {
                                if (el) {
                                  el.indeterminate = checked.size > 0 && checked.size < block.pending.length;
                                }
                              }}
                              checked={block.pending.length > 0 && checked.size === block.pending.length}
                              onChange={(e) => toggleAll(e.target.checked)}
                            />
                          </th>
                        )}
                        <th className="px-3 py-2 text-left">日期</th>
                        <th className="px-3 py-2 text-left">摘要</th>
                        {selectable && <th className="px-3 py-2 text-left">入帳分類</th>}
                        {groupable && <th className="px-3 py-2 text-left">關係人</th>}
                        <th className="px-3 py-2 text-left">備註</th>
                        <th className="px-3 py-2 text-right">金額</th>
                        <th className="w-14 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {block.pending.map((i) => (
                        <Fragment key={i.sourceId}>
                        <tr>
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
                            <td className="px-3 py-2 text-gray-500">{i.categoryName ?? CATEGORY_BY_SOURCE[sourceType]}</td>
                          )}
                          {groupable && (
                            <td className="px-3 py-2">
                              <select
                                value={effectiveParty(i) ?? ""}
                                onChange={(e) => setItemParty(i.sourceId, e.target.value)}
                                title={
                                  i.resolvedPartyId
                                    ? `員工預設指派：${partyName(parties, i.resolvedPartyId)}，可於此單獨覆蓋`
                                    : block.defaultPartyId
                                      ? `此員工未指派負責人，使用帳務設定預設：${partyName(parties, block.defaultPartyId)}`
                                      : "此員工尚未指派負責關係人，請選擇一個"
                                }
                                className={`rounded border px-1.5 py-1 text-xs ${
                                  effectiveParty(i)
                                    ? "border-green-200 bg-green-50 text-green-700"
                                    : "border-amber-300 bg-amber-50 text-amber-700"
                                }`}
                              >
                                <option value="">未指定</option>
                                {parties.filter((p) => p.isActive).map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </td>
                          )}
                          <td className="max-w-[220px] truncate px-3 py-2 text-gray-400" title={i.note ?? ""}>
                            {i.note ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-gray-800">
                            {fmt(i.amount)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right">
                            <button
                              type="button"
                              disabled={ignoringId === i.sourceId}
                              onClick={() => setIgnoreDraft({ id: i.sourceId, reason: "" })}
                              title="不帶入此筆，之後不再出現於待帶入清單（可還原）"
                              className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-60"
                            >
                              不帶入
                            </button>
                          </td>
                        </tr>
                        {ignoreDraft?.id === i.sourceId && (
                          <tr className="bg-gray-50">
                            <td colSpan={8} className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-gray-600">不帶入「{i.label}」的原因（選填）</span>
                                <input
                                  type="text"
                                  autoFocus
                                  value={ignoreDraft.reason}
                                  onChange={(e) => setIgnoreDraft({ id: i.sourceId, reason: e.target.value })}
                                  onKeyDown={(e) => e.key === "Enter" && handleIgnore(i.sourceId, ignoreDraft.reason)}
                                  placeholder="例如：私人加油、重複回報"
                                  className="h-8 min-w-[200px] flex-1 rounded-md border border-gray-300 px-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={ignoringId === i.sourceId}
                                  onClick={() => handleIgnore(i.sourceId, ignoreDraft.reason)}
                                  className="h-8 rounded-md bg-gray-800 px-3 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                                >
                                  確認不帶入
                                </button>
                                <button type="button" onClick={() => setIgnoreDraft(null)} className="h-8 px-2 text-xs text-gray-500">
                                  取消
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-green-700">本月這一類都處理完了。</p>
              )}

              {/* 已略過（不帶入）清單：可還原 */}
              {block.ignored.length > 0 && (
                <details className="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  <summary className="cursor-pointer select-none">
                    不帶入的項目 {block.ignored.length} 筆（合計 {fmt(block.ignoredTotal)}，不列入帳本，可還原）
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {block.ignored.map((i) => (
                      <li key={i.sourceId} className="flex items-center justify-between gap-2">
                        <span>
                          {i.date} {i.label} {fmt(i.amount)}
                          {i.reason && <span className="text-gray-400">　—　{i.reason}</span>}
                        </span>
                        <button
                          type="button"
                          disabled={ignoringId === i.sourceId}
                          onClick={() => handleUnignore(i.sourceId)}
                          className="text-blue-600 hover:underline disabled:opacity-60"
                        >
                          還原
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* 帶入操作 */}
              {block.pending.length > 0 && (
                <div className="space-y-2">
                  {groupable && groupSummary.length > 0 && (
                    <p className="text-xs text-gray-500">
                      將依上方每筆選定的關係人分成 {groupSummary.length} 筆帳目：
                      {groupSummary.map((g, idx) => (
                        <span key={idx}>
                          {idx > 0 ? "、" : ""}
                          {partyName(parties, g.partyId)}（{g.count} 筆 {fmt(g.total)}）
                        </span>
                      ))}
                      {" "}
                      <Link to="/admin/settings?tab=finance" className="text-blue-600 hover:underline">
                        前往帳務設定指派員工預設關係人
                      </Link>
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    {groupable ? (
                      hasUnassigned && (
                        <>
                          <label className="text-sm text-gray-600">批次套用到未指定項目</label>
                          <select
                            value={bulkPartyId}
                            onChange={(e) => setBulkPartyId(e.target.value)}
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                          >
                            <option value="">請選擇</option>
                            {parties.filter((p) => p.isActive).map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={applyBulkToUnassigned}
                            disabled={!bulkPartyId}
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                          >
                            套用
                          </button>
                        </>
                      )
                    ) : (
                      <>
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
                      </>
                    )}
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={submitting}
                      className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {submitting
                        ? "帶入中..."
                        : `帶入已勾選 ${selectedIds.length} 筆（${fmt(selectedTotal)}）`}
                    </button>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type BlockKey = "fuel" | "parking" | "maintenance" | "salary";

const BLOCK_META: Record<BlockKey, { title: string; source: string; subtitle: string }> = {
  fuel: { title: "油資", source: "加油回報", subtitle: "來源：已核准的加油回報 → 記成「支出・油資」，同一付款人合併成一筆（備註列出車牌）" },
  parking: { title: "停車費", source: "停車費回報", subtitle: "來源：已核准的停車費回報 → 記成「支出・停車費」，同一付款人合併成一筆" },
  maintenance: { title: "維修", source: "車輛維修履歷", subtitle: "來源：有費用的維修履歷 → 依類別記成「維修／保險／雜支」，一筆履歷一筆帳" },
  salary: { title: "薪資", source: "薪資封存", subtitle: "來源：已封存的薪資 → 記成「支出・固定薪酬」，一人一筆（已扣除油資／停車費補貼）" },
};

function blockState(key: BlockKey, b: FinanceImportBlockStatus) {
  if (key === "salary" && !b.extra?.monthLocked) {
    return { tone: "red" as const, badge: "未封存", amount: null, hint: "先到薪資計算封存" };
  }
  if (b.sourceCount === 0) return { tone: "gray" as const, badge: "無資料", amount: null, hint: "本月沒有來源" };
  if (b.pending.length > 0) {
    return { tone: "amber" as const, badge: `待帶入 ${b.pending.length} 筆`, amount: b.pendingTotal, hint: `已帶入 ${b.importedCount} 筆` };
  }
  return { tone: "green" as const, badge: "✓ 完成", amount: b.importedTotal, hint: `${b.importedCount} 筆已帶入` };
}

const TONE: Record<"red" | "gray" | "amber" | "green", string> = {
  red: "bg-red-100 text-red-800",
  gray: "bg-gray-100 text-gray-600",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-800",
};

export function FinanceImportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [status, setStatus] = useState<FinanceImportCenterStatus | null>(null);
  const [months, setMonths] = useState<FinanceMonthImportSummary[]>([]);
  const [parties, setParties] = useState<FinanceParty[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<BlockKey | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [preview, setPreview] = useState<FinanceQuickImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [quickImporting, setQuickImporting] = useState(false);
  const [quickResult, setQuickResult] = useState<FinanceQuickImportResult | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<FinanceParty[]>("/finance/parties")
      .then(({ data }) => setParties(data))
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  // 重新載入時不清空畫面，避免展開中的區塊收合
  const load = useCallback(async () => {
    setError(null);
    try {
      const [st, ms] = await Promise.all([
        apiClient.get<FinanceImportCenterStatus>("/finance/import-center", { params: { year, month } }),
        apiClient.get<FinanceMonthImportSummary[]>("/finance/import-center/months", { params: { year, month } }),
      ]);
      setStatus(st.data);
      setMonths(ms.data);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [year, month]);

  useEffect(() => {
    setStatus(null);
    setQuickResult(null);
    setOpenKey(null);
    load();
  }, [load]);

  async function importSimple(
    endpoint: "fuel" | "parking",
    partyId: string,
    sourceIds: string[],
    partyOverrides?: Record<string, string>
  ) {
    await apiClient.post(`/finance/import-center/${endpoint}`, {
      year, month, partyId: partyId || undefined, sourceIds, partyOverrides,
    });
    await load();
  }

  async function importMaintenance(partyId: string, logIds: string[]) {
    await apiClient.post("/finance/import-center/maintenance", { year, month, partyId, logIds });
    await load();
  }

  async function importSalary(partyId: string, snapshotIds: string[], partyOverrides?: Record<string, string>) {
    await apiClient.post("/finance/import-center/salary", {
      year, month, partyId: partyId || undefined, snapshotIds, partyOverrides,
    });
    await load();
  }

  async function openPreview() {
    setPreviewLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<FinanceQuickImportPreview>("/finance/import-center/quick-preview", {
        params: { year, month },
      });
      setPreview(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmQuickImport() {
    setQuickImporting(true);
    setError(null);
    try {
      const { data } = await apiClient.post<FinanceQuickImportResult>("/finance/import-center/quick-import", {
        year,
        month,
      });
      setQuickResult(data);
      setPreview(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setQuickImporting(false);
    }
  }

  async function syncWarning(recordId: string) {
    setSyncingId(recordId);
    setError(null);
    try {
      await apiClient.post(`/finance/import-center/sync/${recordId}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSyncingId(null);
    }
  }

  function focusBlock(key: BlockKey) {
    setOpenKey(key);
    setTimeout(() => document.getElementById(`import-block-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const keys: BlockKey[] = ["fuel", "parking", "maintenance", "salary"];
  const totals = useMemo(() => {
    if (!status) return null;
    const bs = keys.map((k) => status[k]);
    const source = bs.reduce((s, b) => s + b.sourceTotal, 0);
    const imported = bs.reduce((s, b) => s + b.importedTotal, 0);
    const ignored = bs.reduce((s, b) => s + b.ignoredTotal, 0);
    const pending = bs.reduce((s, b) => s + b.pendingTotal, 0);
    const pendingCount = bs.reduce((s, b) => s + b.pending.length, 0);
    return { source, imported, ignored, pending, pendingCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const pct = (n: number) => (totals && totals.source > 0 ? Math.min(100, (n / totals.source) * 100) : 0);
  const recordsLink = `/admin/finance?year=${year}&month=${month}`;

  function describe(label: string, r: FinanceQuickImportBlockResult): { text: string; tone: string } {
    if (r.error) return { text: `${label}：帶入失敗（${r.error}）`, tone: "text-red-700" };
    if (r.skipReason) return { text: `${label}：沒有帶入（${r.skipReason}）`, tone: "text-gray-600" };
    if (r.imported) return { text: `${label}：已帶入 ${r.count} 筆（${fmt(r.totalAmount)}）`, tone: "text-green-800" };
    return { text: `${label}：無資料`, tone: "text-gray-600" };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Import className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-800">帶入中心</h1>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            把已核准的油資、停車費、維修、薪資，轉成帳本裡的支出。
            <button type="button" onClick={() => setShowHelp((v) => !v)} className="ml-1 text-blue-600 hover:underline">
              {showHelp ? "收起說明" : "怎麼運作？"}
            </button>
          </p>
        </div>
        <YearMonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {showHelp && (
        <ul className="list-disc space-y-1 rounded-xl border border-gray-200 bg-white px-8 py-3 text-sm text-gray-600 shadow-sm">
          <li>每一筆來源只能帶入一次；在記帳頁刪除帶入的帳目後，來源會回到「待帶入」。</li>
          <li>付款人預設為員工在「帳務設定」指派的負責人，展開區塊後可逐筆改。</li>
          <li>來源在帶入後又被修改時，上方會出現提醒，可一鍵改成來源的新金額。</li>
          <li>不想入帳的項目按「不帶入」，之後不會再出現；在「不帶入的項目」裡可以還原。</li>
          <li>
            車貸分期在「資產 → 本月應繳」帶入（
            <Link to="/admin/assets?tab=dues" className="text-blue-600 hover:underline">
              前往
            </Link>
            ）。
          </li>
        </ul>
      )}

      {months.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-gray-500">最近月份：</span>
          {months.map((m) => {
            const current = m.year === year && m.month === month;
            const done = m.pendingCount === 0 && m.sourceCount > 0;
            const cls = current
              ? "bg-blue-700 text-white font-semibold"
              : m.sourceCount === 0
                ? "bg-gray-100 text-gray-500"
                : done
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800";
            const text =
              m.sourceCount === 0 ? "無資料" : m.pendingCount > 0 ? `還有 ${m.pendingCount} 筆` : "✓";
            return (
              <button
                key={`${m.year}-${m.month}`}
                type="button"
                onClick={() => { setYear(m.year); setMonth(m.month); }}
                title={m.pendingCount > 0 ? `待帶入 ${fmt(m.pendingTotal)}` : undefined}
                className={`rounded-full px-2.5 py-1 hover:opacity-90 ${cls}`}
              >
                {m.year !== year ? `${m.year}/` : ""}
                {m.month}月 {current ? (m.pendingCount > 0 ? `還有 ${m.pendingCount} 筆` : text) : text}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!status || !totals ? (
        <p className="text-sm text-gray-400">載入中...</p>
      ) : (
        <>
          <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[240px] flex-1 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-sm font-semibold text-gray-800">{month} 月帶入進度</span>
                  <span className="font-mono text-xs text-gray-600">
                    已帶入 {fmt(totals.imported)} ／ 來源 {fmt(totals.source)}
                  </span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="bg-green-600" style={{ width: `${pct(totals.imported)}%` }} />
                  <div className="bg-slate-300" style={{ width: `${pct(totals.ignored)}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-4 text-xs text-gray-600">
                  <span>已帶入 {Math.round(pct(totals.imported))}%</span>
                  {totals.ignored > 0 && <span>不帶入 {fmt(totals.ignored)}</span>}
                  <span className={totals.pendingCount > 0 ? "font-semibold text-amber-800" : ""}>
                    待處理 {fmt(totals.pending)}（{totals.pendingCount} 筆）
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={openPreview}
                disabled={previewLoading || totals.pendingCount === 0}
                className="flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                {previewLoading
                  ? "準備中..."
                  : totals.pendingCount > 0
                    ? "一鍵帶入（先預覽）"
                    : totals.source > 0
                      ? "本月都帶完了"
                      : "本月沒有可帶入的資料"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {keys.map((k) => {
                const st = blockState(k, status[k]);
                const selected = openKey === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => (selected ? setOpenKey(null) : focusBlock(k))}
                    className={`flex flex-col items-start gap-1 rounded-lg border bg-white p-3 text-left transition-shadow hover:shadow ${
                      selected ? "border-blue-600 ring-2 ring-blue-100" : "border-gray-200"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">{BLOCK_META[k].title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${TONE[st.tone]}`}>{st.badge}</span>
                    </div>
                    <span className="text-xs text-gray-500">{BLOCK_META[k].source}</span>
                    <span className="font-mono text-lg font-semibold text-gray-900">
                      {st.amount === null ? "—" : fmt(st.amount)}
                    </span>
                    <span className={`text-xs ${st.tone === "red" ? "text-red-700" : "text-gray-500"}`}>{st.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {quickResult && (
            <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
              <div className="mb-1 flex items-center gap-2 font-semibold text-green-900">
                <CheckCircle className="h-4 w-4" />
                一鍵帶入完成
                <Link to={recordsLink} className="ml-auto text-xs font-normal text-blue-700 hover:underline">
                  到記帳頁查看 →
                </Link>
              </div>
              <ul className="space-y-0.5">
                {(
                  [
                    ["薪資", quickResult.salary],
                    ["油資", quickResult.fuel],
                    ["停車費", quickResult.parking],
                    ["維修", quickResult.maintenance],
                  ] as const
                ).map(([label, r]) => {
                  const d = describe(label, r);
                  return <li key={label} className={d.tone}>{d.text}</li>;
                })}
              </ul>
            </section>
          )}

          {status.warnings.length > 0 && (
            <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                {status.warnings.length} 筆帳目與來源不一致
              </div>
              {status.warnings.map((w) => (
                <div key={`${w.recordId}-${w.message}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 text-amber-900">
                    <b>{w.sourceLabel ?? w.recordNote ?? "帳目"}</b>：{w.message}
                  </span>
                  {w.syncable && (
                    <button
                      type="button"
                      disabled={syncingId === w.recordId}
                      onClick={() => syncWarning(w.recordId)}
                      className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {syncingId === w.recordId ? "更新中..." : "改成來源金額"}
                    </button>
                  )}
                  <Link to={recordsLink} className="text-xs text-amber-900 underline">
                    到記帳頁處理
                  </Link>
                </div>
              ))}
            </section>
          )}

          <div className="space-y-3">
            <ImportBlock
              id="import-block-fuel"
              title={BLOCK_META.fuel.title}
              subtitle={BLOCK_META.fuel.subtitle}
              open={openKey === "fuel"}
              onToggle={() => setOpenKey(openKey === "fuel" ? null : "fuel")}
              sourceType="FUEL_REPORT"
              block={status.fuel}
              parties={parties}
              selectable
              groupable
              onImport={(partyId, sourceIds, partyOverrides) => importSimple("fuel", partyId, sourceIds, partyOverrides)}
              onReload={load}
            />
            <ImportBlock
              id="import-block-parking"
              title={BLOCK_META.parking.title}
              subtitle={BLOCK_META.parking.subtitle}
              open={openKey === "parking"}
              onToggle={() => setOpenKey(openKey === "parking" ? null : "parking")}
              sourceType="PARKING_FEE_REPORT"
              block={status.parking}
              parties={parties}
              selectable
              groupable
              onImport={(partyId, sourceIds, partyOverrides) => importSimple("parking", partyId, sourceIds, partyOverrides)}
              onReload={load}
            />
            <ImportBlock
              id="import-block-maintenance"
              title={BLOCK_META.maintenance.title}
              subtitle={BLOCK_META.maintenance.subtitle}
              open={openKey === "maintenance"}
              onToggle={() => setOpenKey(openKey === "maintenance" ? null : "maintenance")}
              sourceType="MAINTENANCE_LOG"
              block={status.maintenance}
              parties={parties}
              selectable
              onImport={importMaintenance}
              onReload={load}
            />
            <ImportBlock
              id="import-block-salary"
              title={BLOCK_META.salary.title}
              subtitle={BLOCK_META.salary.subtitle}
              open={openKey === "salary"}
              onToggle={() => setOpenKey(openKey === "salary" ? null : "salary")}
              sourceType="SALARY_SNAPSHOT"
              block={status.salary}
              parties={parties}
              selectable
              groupable
              disabledReason={
                status.salary.extra?.monthLocked ? null : "該月份薪資尚未封存。請先於「薪資計算」頁完成封存，再回到此處帶入。"
              }
              onImport={importSalary}
              onReload={load}
            />
            {!status.salary.extra?.monthLocked && (
              <Link
                to="/admin/salary"
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
              >
                前往薪資計算封存 {month} 月 →
              </Link>
            )}
          </div>
        </>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
            <h3 className="text-lg font-bold text-gray-900">一鍵帶入 {month} 月</h3>
            {preview.entries.length > 0 ? (
              <p className="mt-1 text-sm text-gray-600">
                將在帳本建立 <b>{preview.totalRecords} 筆支出</b>，合計{" "}
                <span className="font-mono font-semibold">{fmt(preview.totalAmount)}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-600">目前沒有可以一鍵帶入的項目。</p>
            )}

            {preview.entries.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="px-3 py-2 text-left font-normal">分類</th>
                      <th className="px-3 py-2 text-left font-normal">內容</th>
                      <th className="px-3 py-2 text-left font-normal">付款人</th>
                      <th className="px-3 py-2 text-right font-normal">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.entries.map((e, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">
                          <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs text-orange-800">{e.categoryName}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-800">
                          {e.label}
                          {e.recordCount > 1 && <span className="ml-1 text-xs text-gray-500">（{e.recordCount} 筆帳）</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{e.partyName ?? "-"}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(preview.skipped.length > 0 || preview.problems.length > 0) && (
              <ul className="mt-3 space-y-1 text-sm">
                {preview.skipped.map((s) => (
                  <li key={s.block} className={s.reason.includes("封存") ? "text-red-700" : "text-gray-500"}>
                    — {s.label}：{s.reason}，這次不會帶入
                    {s.reason.includes("封存") && (
                      <Link to="/admin/salary" className="ml-2 text-blue-600 hover:underline">前往封存</Link>
                    )}
                  </li>
                ))}
                {preview.problems.map((p) => (
                  <li key={p} className="text-red-700">! {p}（該類不會帶入）</li>
                ))}
              </ul>
            )}

            <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
              付款人依員工在帳務設定的指派；要逐筆調整請取消後展開各區塊處理。帶入後可在記帳頁查看或修改。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="h-10 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmQuickImport}
                disabled={quickImporting || preview.entries.length === 0}
                className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {quickImporting ? "帶入中..." : `確認帶入 ${preview.totalRecords} 筆`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
