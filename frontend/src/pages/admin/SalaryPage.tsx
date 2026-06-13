import { useEffect, useState } from "react";
import { apiClient, downloadFile, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type {
  DailyRoleType,
  DailySalaryDetail,
  EmployeeMonthlySalary,
  TitleCategory,
  TitleLevel,
  User,
} from "../../api/types";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const roleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

const titleLabels: Record<string, string> = {
  SENIOR: "資深員工",
  STAFF: "員工",
  TEMP: "臨時工",
  CEO: "執行長",
  SPECIAL: "特殊",
};

const sourceLabels: Record<string, string> = {
  AUTO: "系統自動判定",
  OVERRIDE: "管理者手動覆蓋",
  SPECIAL: "特殊職稱（固定）",
};

export function SalaryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canEditRole = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [salaries, setSalaries] = useState<EmployeeMonthlySalary[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deductionAmount, setDeductionAmount] = useState(0);
  const [deductionReason, setDeductionReason] = useState("");
  const [editingDaily, setEditingDaily] = useState<string | null>(null);
  const [editForward, setEditForward] = useState(0);
  const [editReverse, setEditReverse] = useState(0);
  const [savingDaily, setSavingDaily] = useState(false);
  const [savingRoleKey, setSavingRoleKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [salaryRes, usersRes] = await Promise.all([
        apiClient.get<EmployeeMonthlySalary[]>("/salary", { params: { year, month } }),
        apiClient.get<User[]>("/employees"),
      ]);
      setSalaries(salaryRes.data);
      setUsers(usersRes.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function handleOverride(userId: string, category: TitleCategory, level: TitleLevel | null) {
    try {
      await apiClient.post(`/employees/${userId}/title-override`, { year, month, category, level });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function toggleExpanded(userId: string) {
    setExpanded((current) => (current === userId ? null : userId));
    setDeductionAmount(0);
    setDeductionReason("");
    setEditingDaily(null);
  }

  function startEditDaily(userId: string, d: DailySalaryDetail) {
    setEditingDaily(`${userId}_${d.date}`);
    setEditForward(d.forwardCount);
    setEditReverse(d.reverseCount);
  }

  async function handleSaveDaily(userId: string, date: string) {
    setSavingDaily(true);
    try {
      await apiClient.put(`/deliveries/${userId}/${date}`, {
        forwardCount: editForward,
        reverseCount: editReverse,
      });
      setEditingDaily(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingDaily(false);
    }
  }

  async function handleRoleChange(userId: string, date: string, role: DailyRoleType) {
    setSavingRoleKey(`${userId}_${date}`);
    try {
      await apiClient.put(`/daily-roles/${userId}/${date}`, { role });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingRoleKey(null);
    }
  }

  async function handleAddDeduction(userId: string) {
    if (!deductionReason.trim() || deductionAmount <= 0) return;
    try {
      await apiClient.post("/salary/deductions", {
        userId,
        year,
        month,
        amount: deductionAmount,
        reason: deductionReason,
      });
      setDeductionAmount(0);
      setDeductionReason("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleDeleteDeduction(id: string) {
    try {
      await apiClient.delete(`/salary/deductions/${id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleExportAll() {
    try {
      await downloadFile(
        `/salary/export?year=${year}&month=${month}`,
        `salary-${year}-${String(month).padStart(2, "0")}.xlsx`
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleExportEmployee(userId: string, userName: string) {
    try {
      await downloadFile(
        `/salary/${userId}/export?year=${year}&month=${month}`,
        `薪資單_${userName}_${year}年${String(month).padStart(2, "0")}月.pdf`
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const totalSalary = salaries.reduce((sum, s) => sum + s.totalSalary, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">薪資計算</h1>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYearMonth((s) => ({ ...s, year: Number(e.target.value) }))}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setYearMonth((s) => ({ ...s, month: Number(e.target.value) }))}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m} 月
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExportAll}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            匯出 Excel
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">載入中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">員工</th>
                  <th className="px-4 py-2">出勤天數</th>
                  <th className="px-4 py-2">職稱判定</th>
                  <th className="px-4 py-2">判定依據</th>
                  <th className="px-4 py-2">總件數</th>
                  <th className="px-4 py-2">日平均</th>
                  <th className="px-4 py-2">按件薪資</th>
                  <th className="px-4 py-2">司機/隨車加給</th>
                  <th className="px-4 py-2">職務加給</th>
                  <th className="px-4 py-2">激勵獎金</th>
                  <th className="px-4 py-2">扣款</th>
                  <th className="px-4 py-2">總薪資</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((s) => {
                  const user = users.find((u) => u.id === s.userId);
                  const canOverride = !user?.specialTitle;
                  return (
                    <>
                      <tr key={s.userId} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-medium text-gray-800">{s.userName}</td>
                        <td className="px-4 py-2">{s.attendanceDays}</td>
                        <td className="px-4 py-2">
                          {titleLabels[s.titleCategory] ?? s.titleCategory}
                          {s.titleLevel ? `（${s.titleLevel === "HIGH" ? "高" : "低"}）` : ""}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {sourceLabels[s.titleSource]}
                        </td>
                        <td className="px-4 py-2">{s.totalDeliveryCount}</td>
                        <td className="px-4 py-2">{s.averageDailyCount.toFixed(1)}</td>
                        <td className="px-4 py-2">{s.pieceWorkTotal.toLocaleString()}</td>
                        <td className="px-4 py-2">
                          {(s.driverBonusTotal + s.attendantBonusTotal).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">{s.jobAllowance.toLocaleString()}</td>
                        <td className="px-4 py-2">{s.incentiveBonus.toLocaleString()}</td>
                        <td className="px-4 py-2 text-red-600">
                          {s.deductionTotal > 0 ? `-${s.deductionTotal.toLocaleString()}` : "-"}
                        </td>
                        <td className="px-4 py-2 font-semibold">{s.totalSalary.toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(s.userId)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {expanded === s.userId ? "收合" : "明細"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportEmployee(s.userId, s.userName)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              匯出薪資單
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded === s.userId && (
                        <tr className="border-t border-gray-100 bg-gray-50">
                          <td colSpan={13} className="px-4 py-3">
                            {isAdmin && canOverride && (
                              <TitleOverrideForm
                                current={{ category: s.titleCategory as TitleCategory, level: s.titleLevel }}
                                onSave={(category, level) => handleOverride(s.userId, category, level)}
                              />
                            )}
                            {s.dailyDetails.length === 0 ? (
                              <p className="text-sm text-gray-500">本月尚無送件紀錄</p>
                            ) : (
                              <table className="mt-2 w-full text-left text-xs">
                                <thead className="text-gray-500">
                                  <tr>
                                    <th className="px-2 py-1">日期</th>
                                    <th className="px-2 py-1">今日角色</th>
                                    <th className="px-2 py-1">正物流</th>
                                    <th className="px-2 py-1">逆物流</th>
                                    <th className="px-2 py-1">當日件數</th>
                                    <th className="px-2 py-1">單價</th>
                                    <th className="px-2 py-1">小計</th>
                                    {isAdmin && <th className="px-2 py-1"></th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.dailyDetails.map((d) => {
                                    const key = `${s.userId}_${d.date}`;
                                    const isEditing = editingDaily === key;
                                    return (
                                      <tr key={d.date} className="border-t border-gray-200">
                                        <td className="px-2 py-1">{d.date}</td>
                                        <td className="px-2 py-1">
                                          {canEditRole ? (
                                            <select
                                              value={d.role}
                                              disabled={savingRoleKey === key}
                                              onChange={(e) =>
                                                handleRoleChange(s.userId, d.date, e.target.value as DailyRoleType)
                                              }
                                              className="rounded border border-gray-300 px-1 py-0.5"
                                            >
                                              <option value="NONE">無</option>
                                              <option value="TRUCK_DRIVER">貨車司機</option>
                                              <option value="TRUCK_ATTENDANT">貨車隨車人員</option>
                                            </select>
                                          ) : (
                                            roleLabels[d.role]
                                          )}
                                        </td>
                                        <td className="px-2 py-1">
                                          {isEditing ? (
                                            <input
                                              type="number"
                                              value={editForward}
                                              onChange={(e) => setEditForward(Number(e.target.value))}
                                              className="w-16 rounded border border-gray-300 px-1 py-0.5"
                                            />
                                          ) : (
                                            d.forwardCount
                                          )}
                                        </td>
                                        <td className="px-2 py-1">
                                          {isEditing ? (
                                            <input
                                              type="number"
                                              value={editReverse}
                                              onChange={(e) => setEditReverse(Number(e.target.value))}
                                              className="w-16 rounded border border-gray-300 px-1 py-0.5"
                                            />
                                          ) : (
                                            d.reverseCount
                                          )}
                                        </td>
                                        <td className="px-2 py-1">{d.totalCount}</td>
                                        <td className="px-2 py-1">{d.rate}</td>
                                        <td className="px-2 py-1">{d.subtotal.toLocaleString()}</td>
                                        {isAdmin && (
                                          <td className="px-2 py-1">
                                            {isEditing ? (
                                              <span className="space-x-2">
                                                <button
                                                  type="button"
                                                  disabled={savingDaily}
                                                  onClick={() => handleSaveDaily(s.userId, d.date)}
                                                  className="text-blue-600 hover:underline disabled:opacity-60"
                                                >
                                                  儲存
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setEditingDaily(null)}
                                                  className="text-gray-500 hover:underline"
                                                >
                                                  取消
                                                </button>
                                              </span>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => startEditDaily(s.userId, d)}
                                                className="text-blue-600 hover:underline"
                                              >
                                                編輯
                                              </button>
                                            )}
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}

                            <div className="mt-3 border-t border-gray-200 pt-3">
                              <h3 className="mb-2 text-sm font-medium text-gray-700">扣薪項目</h3>
                              {s.deductions.length === 0 ? (
                                <p className="text-sm text-gray-500">本月尚無扣薪項目</p>
                              ) : (
                                <ul className="mb-2 space-y-1">
                                  {s.deductions.map((d) => (
                                    <li
                                      key={d.id}
                                      className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-1.5 text-sm"
                                    >
                                      <span>
                                        {d.reason}：
                                        <span className="text-red-600">-{d.amount.toLocaleString()}</span>
                                      </span>
                                      {isAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteDeduction(d.id)}
                                          className="text-xs text-red-600 hover:underline"
                                        >
                                          刪除
                                        </button>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {isAdmin && (
                                <div className="flex flex-wrap items-end gap-2">
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-500">金額</label>
                                    <input
                                      type="number"
                                      value={deductionAmount}
                                      onChange={(e) => setDeductionAmount(Number(e.target.value))}
                                      className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <label className="mb-1 block text-xs text-gray-500">原因</label>
                                    <input
                                      type="text"
                                      value={deductionReason}
                                      onChange={(e) => setDeductionReason(e.target.value)}
                                      className="w-full min-w-[150px] rounded-md border border-gray-300 px-2 py-1 text-sm"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddDeduction(s.userId)}
                                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                                  >
                                    新增扣款
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-2" colSpan={11}>
                    當月薪資總支出
                  </td>
                  <td className="px-4 py-2">{totalSalary.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TitleOverrideForm({
  current,
  onSave,
}: {
  current: { category: TitleCategory; level: TitleLevel | null };
  onSave: (category: TitleCategory, level: TitleLevel | null) => void;
}) {
  const [category, setCategory] = useState<TitleCategory>(current.category);
  const [level, setLevel] = useState<TitleLevel | null>(current.level);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white p-2 text-xs">
      <span className="text-gray-500">管理者覆蓋職稱：</span>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as TitleCategory)}
        className="rounded border border-gray-300 px-2 py-1"
      >
        <option value="SENIOR">資深員工</option>
        <option value="STAFF">員工</option>
        <option value="TEMP">臨時工</option>
      </select>
      {category !== "TEMP" && (
        <select
          value={level ?? "LOW"}
          onChange={(e) => setLevel(e.target.value as TitleLevel)}
          className="rounded border border-gray-300 px-2 py-1"
        >
          <option value="HIGH">高</option>
          <option value="LOW">低</option>
        </select>
      )}
      <button
        type="button"
        onClick={() => onSave(category, category === "TEMP" ? null : level ?? "LOW")}
        className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700"
      >
        套用此月
      </button>
    </div>
  );
}
