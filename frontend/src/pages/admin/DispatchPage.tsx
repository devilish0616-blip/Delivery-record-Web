import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { DispatchRecord, User, Vehicle } from "../../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DispatchPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [date, setDate] = useState(today());
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [attendantId, setAttendantId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, vehiclesRes, recordsRes] = await Promise.all([
        apiClient.get<User[]>("/employees"),
        apiClient.get<Vehicle[]>("/vehicles"),
        apiClient.get<DispatchRecord[]>("/dispatch"),
      ]);
      setUsers(usersRes.data.filter((u) => u.isActive));
      setVehicles(vehiclesRes.data);
      setRecords(recordsRes.data);
      if (usersRes.data.length > 0 && !driverId) {
        setDriverId(usersRes.data[0].id);
      }
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!driverId) {
      setError("請選擇司機");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post("/dispatch", {
        date,
        vehicleId: vehicleId || null,
        driverId,
        attendantId: attendantId || null,
      });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.delete(`/dispatch/${id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">每日派遣紀錄</h1>

      {isAdmin && (
      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">車輛（選填）</label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">未指定</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plateNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">司機</label>
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">隨車人員（選填）</label>
          <select
            value={attendantId}
            onChange={(e) => setAttendantId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">未指定</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{error}</p>}
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "儲存中..." : "新增派遣紀錄"}
          </button>
        </div>
      </form>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          派遣紀錄列表
        </h2>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : records.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">日期</th>
                  <th className="px-4 py-2">車輛</th>
                  <th className="px-4 py-2">司機</th>
                  <th className="px-4 py-2">隨車人員</th>
                  {isAdmin && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{r.date.slice(0, 10)}</td>
                    <td className="px-4 py-2">{r.vehicle?.plateNumber ?? "-"}</td>
                    <td className="px-4 py-2">{r.driver?.name}</td>
                    <td className="px-4 py-2">{r.attendant?.name ?? "-"}</td>
                    {isAdmin && (
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          刪除
                        </button>
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
