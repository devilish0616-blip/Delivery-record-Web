import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DashboardData, DailyRoleType, Role } from "../../api/types";

const roleLabels: Record<Role, string> = {
  ADMIN: "董事長",
  MANAGER: "執行長",
  REGION_MANAGER: "區經理",
  EMPLOYEE: "員工",
};

const dailyRoleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DailyDeliveryStatusPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayDateString());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get<DashboardData>("/dashboard", { params: { date } })
      .then(({ data }) => {
        if (active) setData(data);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date]);

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="text-sm text-blue-600 hover:underline"
      >
        ← 返回儀表板
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">員工送件狀況</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {loading && <p className="text-sm text-gray-500">載入中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data?.dailyStatus && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">姓名</th>
                  <th className="px-4 py-2">角色</th>
                  <th className="px-4 py-2">正物流件數</th>
                  <th className="px-4 py-2">逆物流件數</th>
                  <th className="px-4 py-2">今日角色</th>
                  <th className="px-4 py-2">備註</th>
                  <th className="px-4 py-2">填寫狀態</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyStatus.employees.map((e) => (
                  <tr key={e.userId} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{e.name}</td>
                    <td className="px-4 py-2 text-gray-500">{roleLabels[e.role]}</td>
                    <td className="px-4 py-2">{e.forwardCount}</td>
                    <td className="px-4 py-2">{e.reverseCount}</td>
                    <td className="px-4 py-2">{e.dailyRole ? dailyRoleLabels[e.dailyRole] : "-"}</td>
                    <td className="px-4 py-2 text-gray-500">{e.note ?? "-"}</td>
                    <td className="px-4 py-2">
                      {e.hasRecord ? (
                        <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">已填寫</span>
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">尚未填寫</span>
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
