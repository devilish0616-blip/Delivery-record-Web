import { useEffect, useState } from "react";
import { Check, Plus, Users } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { PayGrade, SalaryFormulaConfig } from "../../api/types";
import { SalaryFormulaFields, hasNegativeNumber } from "../../components/SalaryFormulaFields";
import { FormulaSimulator } from "../../components/salary/FormulaSimulator";

// 新增職等時的起始公式，數值取自系統原本的預設值，管理者可依需求自行調整
const BLANK_FORMULA_CONFIG: SalaryFormulaConfig = {
  pieceRate: {
    basePrice: 23,
    attendanceBonus: {
      tier1Days: 15,
      tier1Bonus: 1,
      tier2Days: 20,
      tier2Bonus: 0.5,
      tier3Days: 25,
      tier3Bonus: 0.5,
    },
    averageCountBonus: { threshold: 60, bonus: 1 },
    totalCountBonus: { threshold: 2000, bonus: 1 },
  },
  roleBonus: { driverDaily: 1000, attendantDaily: 500 },
  incentiveBonus: {
    tier1Days: 25,
    tier1Avg: 60,
    tier1Amount: 3000,
    tier2Days: 25,
    tier2Avg: 30,
    tier2Amount: 1500,
  },
  formulaNotes: "",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "new" 代表正在建立新職等；null 表示使用者尚未主動選擇，畫面會自動落在預設職等（見 activeId 的推導）
type SelectedId = string | "new" | null;

export function PayGradesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [grades, setGrades] = useState<PayGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<SelectedId>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PayGrade[]>("/pay-grades");
      setGrades(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // 尚未明確選擇時，直接在渲染階段算出「預設職等」當作目前選取項目，
  // 不透過 effect + setState 來同步，畫面一律有東西可編輯／試算
  const defaultOrFirst = grades.find((g) => g.isDefault) ?? grades[0] ?? null;
  const activeId: SelectedId = selectedId ?? defaultOrFirst?.id ?? null;
  const activeGrade = activeId && activeId !== "new" ? (grades.find((g) => g.id === activeId) ?? null) : null;

  async function toggleActive(g: PayGrade) {
    setError(null);
    try {
      await apiClient.put(`/pay-grades/${g.id}`, { isActive: !g.isActive });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function setDefault(g: PayGrade) {
    setError(null);
    try {
      await apiClient.patch(`/pay-grades/${g.id}/set-default`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function remove(g: PayGrade) {
    if (g.isDefault) return;
    if (
      !window.confirm(
        `確定刪除職等「${g.name}」？${g.memberCount > 0 ? `\n目前有 ${g.memberCount} 位員工指派此職等，刪除後將自動改用預設職等計薪。` : ""}`
      )
    )
      return;
    setError(null);
    try {
      await apiClient.delete(`/pay-grades/${g.id}`);
      if (activeId === g.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        {!embedded && <h1 className="text-xl font-semibold text-gray-800">職等薪資設定</h1>}
        <p className="mt-0.5 text-xs text-gray-400">
          每個職等各自帶一份完整的薪資計算公式，員工於「員工」頁指派其中一個職等；未指派職等的員工一律套用預設職等。
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : grades.length === 0 && !isAdmin ? (
        <p className="text-sm text-gray-500">尚無職等</p>
      ) : (
        <div
          className={
            isAdmin ? "grid items-start gap-4 lg:grid-cols-[240px_1fr_320px]" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          <div className="space-y-2">
            {grades.map((g) => (
              <GradeCard
                key={g.id}
                grade={g}
                active={activeId === g.id}
                onClick={() => setSelectedId(g.id)}
                actions={
                  isAdmin
                    ? {
                        onToggleActive: () => toggleActive(g),
                        onSetDefault: () => setDefault(g),
                        onRemove: () => remove(g),
                      }
                    : undefined
                }
              />
            ))}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setSelectedId("new")}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  activeId === "new"
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600"
                }`}
              >
                <Plus className="h-4 w-4" />
                新增職等
              </button>
            )}
          </div>

          {isAdmin && activeId !== null && (
            <GradeEditorPanel
              key={activeId}
              grade={activeGrade}
              isNew={activeId === "new"}
              onCancel={() => setSelectedId(defaultOrFirst?.id ?? null)}
              onSaved={async (saved) => {
                setSelectedId(saved.id);
                await load();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// 編輯區＋右側試算模擬器：兩者共用同一份 config 狀態，config 一改，模擬器立刻反映，
// 抽成獨立元件並用 key={activeId} 讓切換職等時直接整份重掛載（重新從該職等的資料出發），
// 不需要額外寫 effect 去同步表單內容
function GradeEditorPanel({
  grade,
  isNew,
  onCancel,
  onSaved,
}: {
  grade: PayGrade | null;
  isNew: boolean;
  onCancel: () => void;
  onSaved: (saved: PayGrade) => void | Promise<void>;
}) {
  const [name, setName] = useState(grade?.name ?? "");
  const [config, setConfig] = useState<SalaryFormulaConfig>(grade?.config ?? BLANK_FORMULA_CONFIG);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError("請輸入職等名稱");
    if (hasNegativeNumber(config)) return setError("所有數值欄位皆不得為負數或空白");
    setError(null);
    setSaving(true);
    try {
      if (isNew) {
        const { data } = await apiClient.post<PayGrade>("/pay-grades", { name, config });
        await onSaved(data);
      } else if (grade) {
        await apiClient.put(`/pay-grades/${grade.id}`, { name, config });
        await onSaved({ ...grade, name, config });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-700">{isNew ? "新增職等" : "編輯職等"}</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="mb-1 block text-xs text-gray-500">職等名稱</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：一般件計酬、北區高單價"
            className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <SalaryFormulaFields config={config} onChange={setConfig} />

        <div className="flex gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            取消
          </button>
        </div>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <FormulaSimulator config={config} />
      </div>
    </>
  );
}

function GradeCard({
  grade,
  active,
  onClick,
  actions,
}: {
  grade: PayGrade;
  active: boolean;
  onClick: () => void;
  actions?: { onToggleActive: () => void; onSetDefault: () => void; onRemove: () => void };
}) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-colors ${
        active ? "border-blue-600 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"
      } ${grade.isActive ? "" : "opacity-60"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-bold text-gray-800">{grade.name}</span>
        {grade.isDefault && (
          <span className="flex-shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
            預設
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
        <Users className="h-3 w-3" />
        適用 {grade.memberCount} 位員工
      </div>
      <div className="mt-2 flex items-baseline gap-1 font-mono">
        <span className="text-lg font-bold text-blue-700">${grade.config.pieceRate.basePrice.toFixed(1)}</span>
        <span className="text-[11px] font-normal text-gray-400">元／件（底薪）</span>
      </div>
      <p className="mt-0.5 text-[11px] text-gray-400">
        司機 ${grade.config.roleBonus?.driverDaily ?? "-"}／隨車 ${grade.config.roleBonus?.attendantDaily ?? "-"}（日）
      </p>
      {grade.updatedAt && <p className="mt-1 text-[10.5px] text-gray-300">最後修改 {formatDateTime(grade.updatedAt)}</p>}

      {actions && (
        <div
          className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={grade.isDefault}
            onClick={actions.onToggleActive}
            className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              grade.isActive ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {grade.isActive ? "啟用中" : "已停用"}
          </button>
          {!grade.isDefault && (
            <button
              type="button"
              onClick={actions.onSetDefault}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-medium text-blue-600 hover:bg-blue-50"
            >
              <Check className="h-3 w-3" />
              設為預設
            </button>
          )}
          {!grade.isDefault && (
            <button
              type="button"
              onClick={actions.onRemove}
              className="rounded px-1.5 py-0.5 text-[10.5px] font-medium text-red-600 hover:bg-red-50"
            >
              刪除
            </button>
          )}
        </div>
      )}
    </div>
  );
}
