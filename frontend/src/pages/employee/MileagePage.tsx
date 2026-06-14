import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { MileageRecord, Vehicle } from "../../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface DayRow {
  date: string;
  moto?: MileageRecord;
  truck?: MileageRecord;
}

export function MileagePage() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [date, setDate] = useState(today());
  const [records, setRecords] = useState<MileageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [motoVehicleId, setMotoVehicleId] = useState("");
  const [motoEnd, setMotoEnd] = useState("");

  const [truckEnabled, setTruckEnabled] = useState(false);
  const [truckVehicleId, setTruckVehicleId] = useState("");
  const [truckEnd, setTruckEnd] = useState("");

  const motorcycles = vehicles.filter((v) => v.type === "MOTORCYCLE");
  const trucks = vehicles.filter((v) => v.type === "TRUCK");

  function applyDateData(d: string, recs: MileageRecord[], vehicleList: Vehicle[]) {
    const motoIds = new Set(vehicleList.filter((v) => v.type === "MOTORCYCLE").map((v) => v.id));
    const truckIds = new Set(vehicleList.filter((v) => v.type === "TRUCK").map((v) => v.id));
    const dayRecords = recs.filter((r) => r.date.slice(0, 10) === d);
    const motoRecord = dayRecords.find((r) => motoIds.has(r.vehicleId));
    const truckRecord = dayRecords.find((r) => truckIds.has(r.vehicleId));

    setMotoVehicleId(motoRecord?.vehicleId ?? vehicleList.find((v) => v.type === "MOTORCYCLE")?.id ?? "");
    setMotoEnd(motoRecord ? String(motoRecord.endMileage) : "");

    setTruckEnabled(!!truckRecord);
    setTruckVehicleId(truckRecord?.vehicleId ?? vehicleList.find((v) => v.type === "TRUCK")?.id ?? "");
    setTruckEnd(truckRecord ? String(truckRecord.endMileage) : "");
  }

  async function loadData() {
    setLoading(true);
    try {
      const [vehiclesRes, recordsRes] = await Promise.all([
        apiClient.get<Vehicle[]>("/vehicles"),
        apiClient.get<MileageRecord[]>("/mileage"),
      ]);
      setVehicles(vehiclesRes.data);
      setRecords(recordsRes.data);
      applyDateData(date, recordsRes.data, vehiclesRes.data);
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

  function handleDateChange(newDate: string) {
    setDate(newDate);
    applyDateData(newDate, records, vehicles);
  }

  const motoVehicle = vehicles.find((v) => v.id === motoVehicleId);
  const truckVehicle = vehicles.find((v) => v.id === truckVehicleId);

  const motoDistance =
    motoEnd !== "" && motoVehicle ? Number(motoEnd) - motoVehicle.currentMileage : null;
  const truckDistance =
    truckEnd !== "" && truckVehicle ? Number(truckEnd) - truckVehicle.currentMileage : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!motoVehicleId) {
      setError("請選擇機車車牌");
      return;
    }
    if (motoEnd === "") {
      setError("請輸入機車今日結束里程");
      return;
    }
    if (truckEnabled) {
      if (!truckVehicleId) {
        setError("請選擇貨車車牌");
        return;
      }
      if (truckEnd === "") {
        setError("請輸入貨車今日結束里程");
        return;
      }
    }

    setSubmitting(true);
    try {
      await apiClient.post("/mileage", {
        date,
        vehicleId: motoVehicleId,
        endMileage: Number(motoEnd),
      });
      if (truckEnabled) {
        await apiClient.post("/mileage", {
          date,
          vehicleId: truckVehicleId,
          endMileage: Number(truckEnd),
        });
      }
      setMessage("已儲存");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // 整理歷史紀錄：依日期合併機車與貨車里程
  const motoVehicleIds = new Set(motorcycles.map((v) => v.id));
  const truckVehicleIds = new Set(trucks.map((v) => v.id));
  const dayMap = new Map<string, DayRow>();
  for (const r of records) {
    const d = r.date.slice(0, 10);
    if (!dayMap.has(d)) dayMap.set(d, { date: d });
    const row = dayMap.get(d)!;
    if (motoVehicleIds.has(r.vehicleId)) row.moto = r;
    else if (truckVehicleIds.has(r.vehicleId)) row.truck = r;
  }
  const dayRows = Array.from(dayMap.values()).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">車輛里程記錄</h1>
      <p className="text-sm text-gray-500">
        每天只需填寫該車輛「今日結束里程」（收班時的累計里程數），系統會自動以前一次紀錄的里程計算當日行駛里程。
      </p>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">使用人員</label>
            <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">{user?.name}</p>
          </div>
        </div>

        {/* 機車（必填） */}
        <div className="rounded-md border border-gray-200 p-3">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">機車（必填）</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">車牌號碼</label>
              <select
                value={motoVehicleId}
                onChange={(e) => setMotoVehicleId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {motorcycles.length === 0 && <option value="">尚無可用機車</option>}
                {motorcycles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">今日結束里程 (km)</label>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={motoEnd}
                onChange={(e) => setMotoEnd(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              {motoVehicle && (
                <p className="mt-1 text-xs text-gray-400">上次紀錄：{motoVehicle.currentMileage} km</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">當日行駛里程</label>
              <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {motoDistance !== null ? `${motoDistance} km` : "-"}
              </p>
            </div>
          </div>
        </div>

        {/* 貨車（選填） */}
        <div className="rounded-md border border-gray-200 p-3">
          <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={truckEnabled}
              onChange={(e) => setTruckEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            貨車（選填，今日有使用貨車才需填寫）
          </label>
          {truckEnabled && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">車牌號碼</label>
                <select
                  value={truckVehicleId}
                  onChange={(e) => setTruckVehicleId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {trucks.length === 0 && <option value="">尚無可用貨車</option>}
                  {trucks.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">今日結束里程 (km)</label>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={truckEnd}
                  onChange={(e) => setTruckEnd(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                {truckVehicle && (
                  <p className="mt-1 text-xs text-gray-400">上次紀錄：{truckVehicle.currentMileage} km</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">當日行駛里程</label>
                <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {truckDistance !== null ? `${truckDistance} km` : "-"}
                </p>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-600">{message}</p>}
        <div>
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
        ) : dayRows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">日期</th>
                  <th className="px-4 py-2">機車</th>
                  <th className="px-4 py-2">機車里程</th>
                  <th className="px-4 py-2">貨車</th>
                  <th className="px-4 py-2">貨車里程</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map((row) => (
                  <tr key={row.date} className="border-t border-gray-100">
                    <td className="px-4 py-2">{row.date}</td>
                    <td className="px-4 py-2">{row.moto?.vehicle?.plateNumber ?? "-"}</td>
                    <td className="px-4 py-2">
                      {row.moto
                        ? `${row.moto.endMileage} km（行駛 ${row.moto.distance !== null ? `${row.moto.distance} km` : "-"}）`
                        : "-"}
                    </td>
                    <td className="px-4 py-2">{row.truck?.vehicle?.plateNumber ?? "-"}</td>
                    <td className="px-4 py-2">
                      {row.truck
                        ? `${row.truck.endMileage} km（行駛 ${row.truck.distance !== null ? `${row.truck.distance} km` : "-"}）`
                        : "-"}
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
