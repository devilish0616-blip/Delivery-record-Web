import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { MileageRecord, Vehicle } from "../../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MileagePage() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [date, setDate] = useState(today());
  const [vehicleId, setVehicleId] = useState("");
  const [startMileage, setStartMileage] = useState("");
  const [endMileage, setEndMileage] = useState("");
  const [records, setRecords] = useState<MileageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [vehiclesRes, recordsRes] = await Promise.all([
        apiClient.get<Vehicle[]>("/vehicles"),
        apiClient.get<MileageRecord[]>("/mileage"),
      ]);
      setVehicles(vehiclesRes.data);
      setRecords(recordsRes.data);
      if (vehiclesRes.data.length > 0 && !vehicleId) {
        setVehicleId(vehiclesRes.data[0].id);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const distance =
    startMileage !== "" && endMileage !== ""
      ? Number(endMileage) - Number(startMileage)
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!vehicleId) {
      setError("請選擇車牌號碼");
      return;
    }
    if (distance !== null && distance < 0) {
      setError("結束里程不可小於起始里程");
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post("/mileage", {
        date,
        vehicleId,
        startMileage: Number(startMileage || 0),
        endMileage: Number(endMileage || 0),
      });
      setMessage("已儲存");
      setStartMileage("");
      setEndMileage("");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">車輛里程記錄</h1>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2"
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
          <label className="mb-1 block text-sm font-medium text-gray-700">車牌號碼</label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {vehicles.length === 0 && <option value="">尚無可用車輛</option>}
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plateNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">當日起始里程 (km)</label>
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={startMileage}
            onChange={(e) => setStartMileage(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">當日結束里程 (km)</label>
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={endMileage}
            onChange={(e) => setEndMileage(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">當日行駛里程</label>
          <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {distance !== null ? `${distance} km` : "-"}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">使用人員</label>
          <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">{user?.name}</p>
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {message && <p className="text-sm text-green-600 sm:col-span-2">{message}</p>}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "儲存中..." : "送出"}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          歷史紀錄
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
                  <th className="px-4 py-2">車牌</th>
                  <th className="px-4 py-2">起始</th>
                  <th className="px-4 py-2">結束</th>
                  <th className="px-4 py-2">行駛里程</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{r.date.slice(0, 10)}</td>
                    <td className="px-4 py-2">{r.vehicle?.plateNumber}</td>
                    <td className="px-4 py-2">{r.startMileage}</td>
                    <td className="px-4 py-2">{r.endMileage}</td>
                    <td className="px-4 py-2">{r.distance} km</td>
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
