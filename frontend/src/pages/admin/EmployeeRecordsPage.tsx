import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type {
  DailyRoleType,
  EmployeeRecordsData,
  LeaveStatus,
  TitleCategory,
  TitleLevel,
  VehicleType,
} from "../../api/types";

const roleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

const statusLabels: Record<LeaveStatus, string> = {
  PENDING: "待審核",
  APPROVED: "已核准",
  REJECTED: "已拒絕",
};

const titleLabels: Record<TitleCategory, string> = {
  SENIOR: "資深員工",
  STAFF: "員工",
  TEMP: "臨時工",
};

const levelLabels: Record<TitleLevel, string> = {
  HIGH: "高",
  LOW: "低",
};

const vehicleTypeLabels: Record<VehicleType, string> = {
  MOTORCYCLE: "機車",
  TRUCK: "貨車",
};

export function EmployeeRecordsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [data, setData] = useState<EmployeeRecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const [clearOpen, setClearOpen] = useState(false);
  const [clearInput, setClearInput] = useState("");
  const [clearing, setClearing] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<EmployeeRecordsData>(`/employees/${id}/records`);
      setData(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-800">員工紀錄管理</h1>
        <p className="text-sm text-red-600">此頁面僅管理者可查看</p>
        <Link to="/admin/employees" className="text-sm text-blue-600 hover:underline">
          返回員工管理
        </Link>
      </div>
    );
  }

  async function runDelete(key: string, action: () => Promise<unknown>) {
    if (confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    setConfirmKey(null);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function deleteButton(key: string, action: () => Promise<unknown>) {
    const confirming = confirmKey === key;
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => runDelete(key, action)}
          className={`text-xs hover:underline ${
            confirming ? "font-medium text-red-700" : "text-red-600"
          }`}
        >
          {confirming ? "確認刪除？" : "刪除"}
        </button>
        {confirming && (
          <button
            type="button"
            onClick={() => setConfirmKey(null)}
            className="text-xs text-gray-500 hover:underline"
          >
            取消
          </button>
        )}
      </div>
    );
  }

  async function handleClear() {
    if (!data || !id) return;
    if (clearInput !== data.user.name) return;
    setClearing(true);
    setError(null);
    try {
      await apiClient.delete(`/employees/${id}/records`);
      setClearOpen(false);
      setClearInput("");
      setMessage("已清空此員工的所有歷史紀錄。如需刪除帳號，請回到「員工管理」頁面操作。");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">員工紀錄管理</h1>
          {data && (
            <p className="mt-1 text-sm text-gray-500">
              {data.user.name}（{data.user.email}）
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/admin/employees" className="text-sm text-blue-600 hover:underline">
            返回員工管理
          </Link>
          {data && (
            <button
              type="button"
              onClick={() => {
                setClearInput("");
                setClearOpen(true);
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              清空所有紀錄
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : !data ? (
        <p className="text-sm text-gray-500">找不到此員工</p>
      ) : (
        <>
          {/* 送件紀錄 */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
              送件紀錄
            </h2>
            {data.deliveries.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-2">日期</th>
                      <th className="px-4 py-2">正物流件數</th>
                      <th className="px-4 py-2">逆物流件數</th>
                      <th className="px-4 py-2">備註</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deliveries.map((r) => {
                      const dateStr = r.date.slice(0, 10);
                      return (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-4 py-2">{dateStr}</td>
                          <td className="px-4 py-2">{r.forwardCount}</td>
                          <td className="px-4 py-2">{r.reverseCount}</td>
                          <td className="px-4 py-2 text-gray-500">{r.note ?? "-"}</td>
                          <td className="px-4 py-2">
                            {deleteButton(`delivery-${r.id}`, () =>
                              apiClient.delete(`/deliveries/${id}/${dateStr}`)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 車輛里程紀錄 */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
              車輛里程紀錄
            </h2>
            {data.mileages.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-2">日期</th>
                      <th className="px-4 py-2">車輛</th>
                      <th className="px-4 py-2">起始里程</th>
                      <th className="px-4 py-2">結束里程</th>
                      <th className="px-4 py-2">行駛距離</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mileages.map((m) => (
                      <tr key={m.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">{m.date.slice(0, 10)}</td>
                        <td className="px-4 py-2">
                          {m.vehicle
                            ? `${m.vehicle.plateNumber}（${vehicleTypeLabels[m.vehicle.type]}）`
                            : "-"}
                        </td>
                        <td className="px-4 py-2">{m.startMileage}</td>
                        <td className="px-4 py-2">{m.endMileage}</td>
                        <td className="px-4 py-2">{m.distance}</td>
                        <td className="px-4 py-2">
                          {deleteButton(`mileage-${m.id}`, () => apiClient.delete(`/mileage/${m.id}`))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 今日角色紀錄 */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
              今日角色紀錄
            </h2>
            {data.dailyRoles.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-2">日期</th>
                      <th className="px-4 py-2">角色</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyRoles.map((r) => {
                      const dateStr = r.date.slice(0, 10);
                      return (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-4 py-2">{dateStr}</td>
                          <td className="px-4 py-2">{roleLabels[r.role]}</td>
                          <td className="px-4 py-2">
                            {deleteButton(`role-${r.id}`, () =>
                              apiClient.delete(`/daily-roles/${id}/${dateStr}`)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 請假申請 */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
              請假申請
            </h2>
            {data.leaves.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-2">日期</th>
                      <th className="px-4 py-2">原因</th>
                      <th className="px-4 py-2">狀態</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leaves.map((l) => (
                      <tr key={l.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">{l.date.slice(0, 10)}</td>
                        <td className="px-4 py-2 text-gray-500">{l.reason ?? "-"}</td>
                        <td className="px-4 py-2">{statusLabels[l.status]}</td>
                        <td className="px-4 py-2">
                          {deleteButton(`leave-${l.id}`, () => apiClient.delete(`/leaves/${l.id}`))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 薪資扣款 */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
              薪資扣款
            </h2>
            {data.deductions.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-2">年/月</th>
                      <th className="px-4 py-2">金額</th>
                      <th className="px-4 py-2">原因</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deductions.map((d) => (
                      <tr key={d.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">
                          {d.year} / {d.month}
                        </td>
                        <td className="px-4 py-2">{d.amount.toLocaleString()}</td>
                        <td className="px-4 py-2 text-gray-500">{d.reason}</td>
                        <td className="px-4 py-2">
                          {deleteButton(`deduction-${d.id}`, () =>
                            apiClient.delete(`/salary/deductions/${d.id}`)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 職稱覆蓋 */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
              職稱覆蓋
            </h2>
            {data.titleOverrides.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-2">年/月</th>
                      <th className="px-4 py-2">職稱</th>
                      <th className="px-4 py-2">高/低</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.titleOverrides.map((o) => (
                      <tr key={o.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">
                          {o.year} / {o.month}
                        </td>
                        <td className="px-4 py-2">{titleLabels[o.category]}</td>
                        <td className="px-4 py-2">{o.level ? levelLabels[o.level] : "-"}</td>
                        <td className="px-4 py-2">
                          {deleteButton(`override-${o.id}`, () =>
                            apiClient.delete(`/employees/${id}/title-overrides/${o.id}`)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {clearOpen && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-800">清空所有紀錄</h3>
            <p className="mt-2 text-sm text-gray-600">
              此操作將刪除「{data.user.name}」的所有送件紀錄、車輛里程紀錄、今日角色紀錄、請假申請與薪資相關資料，且無法復原。
            </p>
            <p className="mt-2 text-sm text-gray-600">
              請輸入員工姓名「<span className="font-medium">{data.user.name}</span>」以確認：
            </p>
            <input
              type="text"
              value={clearInput}
              onChange={(e) => setClearInput(e.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder={data.user.name}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={clearing || clearInput !== data.user.name}
                onClick={handleClear}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {clearing ? "處理中..." : "確認清空"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
