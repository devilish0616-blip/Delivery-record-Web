import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { DailyRoleRecord, DailyRoleType, MileageRecord, Vehicle } from "../../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const roleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  DRIVER: "司機",
  ATTENDANT: "隨車人員",
};

interface DayRow {
  date: string;
  role: DailyRoleType;
  moto?: MileageRecord;
  truck?: MileageRecord;
}

export function MileagePage() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [date, setDate] = useState(today());
  const [records, setRecords] = useState<MileageRecord[]>([]);
  const [dailyRoles, setDailyRoles] = useState<DailyRoleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [todayRole, setTodayRole] = useState<DailyRoleType>("NONE");

  const [motoVehicleId, setMotoVehicleId] = useState("");
  const [motoStart, setMotoStart] = useState("");
  const [motoEnd, setMotoEnd] = useState("");

  const [truckEnabled, setTruckEnabled] = useState(false);
  const [truckVehicleId, setTruckVehicleId] = useState("");
  const [truckStart, setTruckStart] = useState("");
  const [truckEnd, setTruckEnd] = useState("");

  const motorcycles = vehicles.filter((v) => v.type === "MOTORCYCLE");
  const trucks = vehicles.filter((v) => v.type === "TRUCK");

  function applyDateData(
    d: string,
    recs: MileageRecord[],
    roles: DailyRoleRecord[],
    vehicleList: Vehicle[]
  ) {
    const motoIds = new Set(vehicleList.filter((v) => v.type === "MOTORCYCLE").map((v) => v.id));
    const truckIds = new Set(vehicleList.filter((v) => v.type === "TRUCK").map((v) => v.id));
    const dayRecords = recs.filter((r) => r.date.slice(0, 10) === d);
    const motoRecord = dayRecords.find((r) => motoIds.has(r.vehicleId));
    const truckRecord = dayRecords.find((r) => truckIds.has(r.vehicleId));
    const roleRecord = roles.find((r) => r.date.slice(0, 10) === d);

    setMotoVehicleId(motoRecord?.vehicleId ?? vehicleList.find((v) => v.type === "MOTORCYCLE")?.id ?? "");
    setMotoStart(motoRecord ? String(motoRecord.startMileage) : "");
    setMotoEnd(motoRecord ? String(motoRecord.endMileage) : "");

    setTruckEnabled(!!truckRecord);
    setTruckVehicleId(truckRecord?.vehicleId ?? vehicleList.find((v) => v.type === "TRUCK")?.id ?? "");
    setTruckStart(truckRecord ? String(truckRecord.startMileage) : "");
    setTruckEnd(truckRecord ? String(truckRecord.endMileage) : "");

    setTodayRole(roleRecord?.role ?? "NONE");
  }

  async function loadData() {
    setLoading(true);
    try {
      const [vehiclesRes, recordsRes, rolesRes] = await Promise.all([
        apiClient.get<Vehicle[]>("/vehicles"),
        apiClient.get<MileageRecord[]>("/mileage"),
        apiClient.get<DailyRoleRecord[]>("/daily-roles"),
      ]);
      setVehicles(vehiclesRes.data);
      setRecords(recordsRes.data);
      setDailyRoles(rolesRes.data);
      applyDateData(date, recordsRes.data, rolesRes.data, vehiclesRes.data);
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
    applyDateData(newDate, records, dailyRoles, vehicles);
  }

  const motoDistance =
    motoStart !== "" && motoEnd !== "" ? Number(motoEnd) - Number(motoStart) : null;
  const truckDistance =
    truckStart !== "" && truckEnd !== "" ? Number(truckEnd) - Number(truckStart) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!motoVehicleId) {
      setError("請選擇機車車牌");
      return;
    }
    if (motoStart === "" || motoEnd === "") {
      setError("請輸入機車起始與結束里程");
      return;
    }
    if (motoDistance !== null && motoDistance < 0) {
      setError("機車結束里程不可小於起始里程");
      return;
    }
    if (truckEnabled) {
      if (!truckVehicleId) {
        setError("請選擇貨車車牌");
        return;
      }
      if (truckStart === "" || truckEnd === "") {
        setError("請輸入貨車起始與結束里程");
        return;
      }
      if (truckDistance !== null && truckDistance < 0) {
        setError("貨車結束里程不可小於起始里程");
        return;
      }
    }

    setSubmitting(true);
    try {
      await apiClient.post("/daily-roles", { date, role: todayRole });
      await apiClient.post("/mileage", {
        date,
        vehicleId: motoVehicleId,
        startMileage: Number(motoStart),
        endMileage: Number(motoEnd),
      });
      if (truckEnabled) {
        await apiClient.post("/mileage", {
          date,
          vehicleId: truckVehicleId,
          startMileage: Number(truckStart),
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

  // 整理歷史紀錄：依日期合併里程與今日角色
  const motoVehicleIds = new Set(motorcycles.map((v) => v.id));
  const truckVehicleIds = new Set(trucks.map((v) => v.id));
  const dayMap = new Map<string, DayRow>();
  for (const r of records) {
    const d = r.date.slice(0, 10);
    if (!dayMap.has(d)) dayMap.set(d, { date: d, role: "NONE" });
    const row = dayMap.get(d)!;
    if (motoVehicleIds.has(r.vehicleId)) row.moto = r;
    else if (truckVehicleIds.has(r.vehicleId)) row.truck = r;
  }
  for (const r of dailyRoles) {
    const d = r.date.slice(0, 10);
    if (!dayMap.has(d)) dayMap.set(d, { date: d, role: r.role });
    else dayMap.get(d)!.role = r.role;
  }
  const dayRows = Array.from(dayMap.values()).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">車輛里程記錄</h1>

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
            <label className="mb-1 block text-sm font-medium text-gray-700">今日角色</label>
            <select
              value={todayRole}
              onChange={(e) => setTodayRole(e.target.value as DailyRoleType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="NONE">無</option>
              <option value="DRIVER">司機</option>
              <option value="ATTENDANT">隨車人員</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">使用人員</label>
            <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">{user?.name}</p>
          </div>
        </div>

        {/* 機車（必填） */}
        <div className="rounded-md border border-gray-200 p-3">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">機車（必填）</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <label className="mb-1 block text-sm font-medium text-gray-700">當日起始里程 (km)</label>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={motoStart}
                onChange={(e) => setMotoStart(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">當日結束里程 (km)</label>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={motoEnd}
                onChange={(e) => setMotoEnd(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <label className="mb-1 block text-sm font-medium text-gray-700">當日起始里程 (km)</label>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={truckStart}
                  onChange={(e) => setTruckStart(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">當日結束里程 (km)</label>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={truckEnd}
                  onChange={(e) => setTruckEnd(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
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
                  <th className="px-4 py-2">今日角色</th>
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
                    <td className="px-4 py-2">{roleLabels[row.role]}</td>
                    <td className="px-4 py-2">{row.moto?.vehicle?.plateNumber ?? "-"}</td>
                    <td className="px-4 py-2">
                      {row.moto ? `${row.moto.startMileage} → ${row.moto.endMileage} (${row.moto.distance} km)` : "-"}
                    </td>
                    <td className="px-4 py-2">{row.truck?.vehicle?.plateNumber ?? "-"}</td>
                    <td className="px-4 py-2">
                      {row.truck ? `${row.truck.startMileage} → ${row.truck.endMileage} (${row.truck.distance} km)` : "-"}
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
