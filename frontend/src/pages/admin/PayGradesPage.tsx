import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { PayGrade, SalaryFormulaConfig } from "../../api/types";
import { SalaryFormulaFields, hasNegativeNumber } from "../../components/SalaryFormulaFields";

// 新增職等時的起始公式，數值取自系統原本的預設值，管理者可依需求自行調整
const BLANK_FORMULA_CONFIG: SalaryFormulaConfig = {
  attendanceThresholds: { seniorMinDays: 20, staffMinDays: 10 },
  levelThreshold: { highAvgThreshold: 60 },
  dailyRates: {
    dailyCountBreakpoint: 100,
    seniorStaffHigh: { above: 28, atOrBelow: 25 },
    seniorStaffLow: { above: 26, atOrBelow: 23 },
    temp: 23,
    special: 30,
  },
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

export function PayGradesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [grades, setGrades] = useState<PayGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null); // null=未編輯, "new"=新增
  const [name, setName] = useState("");
  const [config, setConfig] = useState<SalaryFormulaConfig>(BLANK_FORMULA_CONFIG);
  const [saving, setSaving] = useState(false);

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

  function startNew() {
    setEditingId("new");
    setName("");
    setConfig(BLANK_FORMULA_CONFIG);
  }
  function startEdit(g: PayGrade) {
    setEditingId(g.id);
    setName(g.name);
    setConfig(g.config);
  }
  function cancel() {
    setEditingId(null);
  }

  async function save() {
    if (!name.trim()) return setError("請輸入職等名稱");
    if (hasNegativeNumber(config)) return setError("所有數值欄位皆不得為負數或空白");
    setError(null);
    setSaving(true);
    try {
      if (editingId === "new") {
        await apiClient.post("/pay-grades", { name, config });
      } else {
        await apiClient.put(`/pay-grades/${editingId}`, { name, config });
      }
      cancel();
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

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
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-800">職等薪資設定</h1>

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
        每個職等各自帶一份完整的薪資計算公式（門檻／單價／激勵獎金），員工於「員工管理」頁指派其中一個職等；
        未指派職等的員工，一律套用標示「預設」的那個職等。
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isAdmin && editingId === null && (
        <button
          type="button"
          onClick={startNew}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          + 新增職等
        </button>
      )}

      {isAdmin && editingId !== null && (
        <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
          <p className="text-sm font-medium text-gray-700">{editingId === "new" ? "新增職等" : "編輯職等"}</p>
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

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "儲存中..." : "儲存"}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : grades.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無職等，請新增。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">職等名稱</th>
                  <th className="px-4 py-2">指派人數</th>
                  <th className="px-4 py-2">狀態</th>
                  <th className="px-4 py-2">最後修改</th>
                  {isAdmin && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {grades.map((g) => (
                  <tr key={g.id} className={`border-t border-gray-100 ${g.isActive ? "" : "opacity-60"}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {g.name}
                      {g.isDefault && (
                        <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">預設</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{g.memberCount}</td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => toggleActive(g)}
                          disabled={g.isDefault}
                          className={`rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
                            g.isActive
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {g.isActive ? "啟用中" : "已停用"}
                        </button>
                      ) : (
                        <span className="text-gray-600">{g.isActive ? "啟用中" : "已停用"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">
                      {g.updatedAt ? formatDateTime(g.updatedAt) : "-"}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(g)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            編輯
                          </button>
                          {!g.isDefault && (
                            <button
                              type="button"
                              onClick={() => setDefault(g)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              設為預設
                            </button>
                          )}
                          {!g.isDefault && (
                            <button
                              type="button"
                              onClick={() => remove(g)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              刪除
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
