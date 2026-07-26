import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DailyRoleAuditLog, DailyRoleAuditSource, DailyRoleType } from "../../api/types";

const roleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

const sourceLabels: Record<DailyRoleAuditSource, string> = {
  SELF: "員工自填",
  ADMIN: "管理者／主管校正",
  DELETE: "管理者刪除",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function DailyRoleAuditLogPage() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [logs, setLogs] = useState<DailyRoleAuditLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<DailyRoleAuditLog[]>("/daily-roles/audit-log", {
        params: { from, to },
      });
      setLogs(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">今日角色異動紀錄</h1>
      <p className="text-sm text-gray-500">
        查詢每一筆「今日角色」（貨車司機／隨車人員）的變更歷程：誰在何時把哪一天的角色從什麼改成什麼，唯讀不可修改。
      </p>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">起始日期</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">結束日期</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          查詢
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : !logs || logs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">此區間查無異動紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">角色所屬日期</th>
                  <th className="px-4 py-2">員工</th>
                  <th className="px-4 py-2">變更前</th>
                  <th className="px-4 py-2">變更後</th>
                  <th className="px-4 py-2">來源</th>
                  <th className="px-4 py-2">操作者</th>
                  <th className="px-4 py-2">操作時間</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{log.date.slice(0, 10)}</td>
                    <td className="px-4 py-2">{log.user.name}</td>
                    <td className="px-4 py-2 text-gray-500">{roleLabels[log.previousRole]}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">{roleLabels[log.newRole]}</td>
                    <td className="px-4 py-2">{sourceLabels[log.source]}</td>
                    <td className="px-4 py-2">{log.changedBy.name}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(log.createdAt).toLocaleString("zh-TW")}
                    </td>
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
