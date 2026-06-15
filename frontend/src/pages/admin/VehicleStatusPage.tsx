import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DashboardData } from "../../api/types";

export function VehicleStatusPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get<DashboardData>("/dashboard")
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
  }, []);

  const vehicles = data?.vehicles ?? null;
  const todayMileage = data?.todayMileage ?? null;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="text-sm text-blue-600 hover:underline"
      >
        ← 返回儀表板
      </button>

      <h1 className="text-xl font-semibold text-gray-800">車輛狀況</h1>

      {loading && <p className="text-sm text-gray-500">載入中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {vehicles && todayMileage && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">車牌</th>
                  <th className="px-4 py-2">車型</th>
                  <th className="px-4 py-2">目前累計里程</th>
                  <th className="px-4 py-2">保養狀態</th>
                  <th className="px-4 py-2">今日使用</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const usage = todayMileage.filter((m) => m.vehicleId === v.id);
                  return (
                    <tr key={v.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">{v.plateNumber}</td>
                      <td className="px-4 py-2">{v.type === "MOTORCYCLE" ? "機車" : "貨車"}</td>
                      <td className="px-4 py-2">{v.currentMileage} km</td>
                      <td className="px-4 py-2">
                        {v.maintenanceItems.map((m) => (
                          <span
                            key={m.id}
                            className={`mr-2 inline-block ${
                              m.needsChange
                                ? "font-medium text-red-600"
                                : m.warning
                                ? "font-medium text-amber-600"
                                : "text-gray-500"
                            }`}
                          >
                            {m.itemName} {m.needsChange ? "已逾期" : `剩 ${m.remaining.toFixed(0)} km`}
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {usage.length === 0
                          ? "-"
                          : usage
                              .map(
                                (m) =>
                                  `${m.user?.name ?? ""} (${m.distance !== null ? `${m.distance} km` : "首次紀錄"})`
                              )
                              .join("、")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
