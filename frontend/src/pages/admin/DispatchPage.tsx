import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { DailyRoleType, DispatchSummary, VehicleType } from "../../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const roleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  DRIVER: "司機",
  ATTENDANT: "隨車人員",
};

const typeLabels: Record<VehicleType, string> = {
  MOTORCYCLE: "機車",
  TRUCK: "貨車",
};

export function DispatchPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [date, setDate] = useState(today());
  const [summary, setSummary] = useState<DispatchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load(targetDate: string) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<DispatchSummary>("/dispatch", { params: { date: targetDate } });
      setSummary(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function handleRoleChange(userId: string, role: DailyRoleType) {
    setError(null);
    setSavingKey(userId);
    try {
      await apiClient.put(`/daily-roles/${userId}/${date}`, { role });
      await load(date);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">派遣紀錄統計</h1>
      <p className="text-sm text-gray-500">
        依據員工填寫的「車輛里程記錄」與「今日角色」自動統計，僅供查看
        {isAdmin && "（管理者可調整今日角色）"}。
      </p>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-gray-700">日期</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          車輛使用狀況
        </h2>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : !summary || summary.vehicles.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">當日尚無車輛使用紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">車牌</th>
                  <th className="px-4 py-2">車型</th>
                  <th className="px-4 py-2">人員</th>
                  <th className="px-4 py-2">角色</th>
                  <th className="px-4 py-2">里程</th>
                  <th className="px-4 py-2">行駛距離</th>
                </tr>
              </thead>
              <tbody>
                {summary.vehicles.map((v) =>
                  v.users.map((u, idx) => (
                    <tr key={`${v.vehicleId}-${u.userId}`} className="border-t border-gray-100">
                      {idx === 0 ? (
                        <>
                          <td className="px-4 py-2 font-medium text-gray-800" rowSpan={v.users.length}>
                            {v.plateNumber}
                          </td>
                          <td className="px-4 py-2 text-gray-500" rowSpan={v.users.length}>
                            {typeLabels[v.type] ?? v.type}
                          </td>
                        </>
                      ) : null}
                      <td className="px-4 py-2">{u.userName}</td>
                      <td className="px-4 py-2">
                        {isAdmin ? (
                          <select
                            value={u.role}
                            disabled={savingKey === u.userId}
                            onChange={(e) => handleRoleChange(u.userId, e.target.value as DailyRoleType)}
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          >
                            <option value="NONE">無</option>
                            <option value="DRIVER">司機</option>
                            <option value="ATTENDANT">隨車人員</option>
                          </select>
                        ) : (
                          roleLabels[u.role]
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {u.startMileage} → {u.endMileage}
                      </td>
                      <td className="px-4 py-2">{u.distance} km</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {summary && summary.usersWithoutVehicle.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
            其他人員（無車輛使用紀錄但已設定角色）
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">人員</th>
                  <th className="px-4 py-2">角色</th>
                </tr>
              </thead>
              <tbody>
                {summary.usersWithoutVehicle.map((u) => (
                  <tr key={u.userId} className="border-t border-gray-100">
                    <td className="px-4 py-2">{u.userName}</td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <select
                          value={u.role}
                          disabled={savingKey === u.userId}
                          onChange={(e) => handleRoleChange(u.userId, e.target.value as DailyRoleType)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="NONE">無</option>
                          <option value="DRIVER">司機</option>
                          <option value="ATTENDANT">隨車人員</option>
                        </select>
                      ) : (
                        roleLabels[u.role]
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
