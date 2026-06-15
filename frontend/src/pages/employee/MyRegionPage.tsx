import { useEffect, useMemo, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type {
  DailyRoleType,
  DispatchSummary,
  EmployeeMonthlySalary,
  LeaveRequest,
  LeaveStatus,
  MyRegion,
  MyRegionsData,
  RegionDailyStatus,
  VehicleType,
} from "../../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const roleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

const typeLabels: Record<VehicleType, string> = {
  MOTORCYCLE: "機車",
  TRUCK: "貨車",
};

const titleLabels: Record<string, string> = {
  SENIOR: "資深員工",
  STAFF: "員工",
  TEMP: "臨時工",
  CEO: "執行長",
  SPECIAL: "特殊",
};

const statusLabels: Record<LeaveStatus, string> = {
  PENDING: "待審核",
  APPROVED: "已核准",
  REJECTED: "已拒絕",
};

const statusStyles: Record<LeaveStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-gray-100 text-gray-500",
};

const leaveFilterOptions: { value: LeaveStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "PENDING", label: "待審核" },
  { value: "APPROVED", label: "已核准" },
  { value: "REJECTED", label: "已拒絕" },
];

type TabKey = "status" | "members" | "leaves" | "dispatch";

const tabs: { key: TabKey; label: string }[] = [
  { key: "status", label: "今日送件狀況" },
  { key: "members", label: "成員列表" },
  { key: "leaves", label: "請假管理" },
  { key: "dispatch", label: "派遣紀錄" },
];

export function MyRegionPage() {
  const [regions, setRegions] = useState<MyRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("status");
  const [todayCount, setTodayCount] = useState<number | null>(null);

  useEffect(() => {
    apiClient
      .get<MyRegionsData>("/regions/my")
      .then(({ data }) => {
        setRegions(data.regions);
        if (data.regions.length > 0) setSelectedRegionId(data.regions[0].id);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const selectedRegion = regions.find((r) => r.id === selectedRegionId) ?? null;

  useEffect(() => {
    if (!selectedRegion) return;
    let active = true;
    apiClient
      .get<RegionDailyStatus>("/regions/my/daily-status", {
        params: { date: today(), regionId: selectedRegion.id },
      })
      .then(({ data }) => {
        if (active) setTodayCount(data.members.filter((m) => m.hasSubmitted).length);
      })
      .catch(() => {
        if (active) setTodayCount(null);
      });
    return () => {
      active = false;
    };
  }, [selectedRegion]);

  if (loading) return <p className="text-sm text-gray-500">載入中...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (regions.length === 0) {
    return <p className="text-sm text-gray-500">您目前未被指定為任何區域的區域經理</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">我的區域</h1>
        {regions.length > 1 && (
          <select
            value={selectedRegionId ?? ""}
            onChange={(e) => setSelectedRegionId(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedRegion && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="區域名稱" value={selectedRegion.name} />
            <SummaryCard label="成員總數" value={`${selectedRegion.members.length} 人`} />
            <SummaryCard
              label="今日出勤人數"
              value={todayCount === null ? "-" : `${todayCount} 人`}
            />
          </div>

          <div className="flex gap-2 border-b border-gray-200">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "status" && <TodayStatusTab regionId={selectedRegion.id} />}
          {tab === "members" && <MembersTab members={selectedRegion.members} />}
          {tab === "leaves" && <LeavesTab members={selectedRegion.members} />}
          {tab === "dispatch" && <DispatchTab members={selectedRegion.members} />}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function TodayStatusTab({ regionId }: { regionId: string }) {
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState<RegionDailyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get<RegionDailyStatus>("/regions/my/daily-status", { params: { date, regionId } })
      .then(({ data }) => {
        if (active) setStatus(data);
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
  }, [date, regionId]);

  return (
    <div className="space-y-4">
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
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : !status || status.members.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">此區域尚無成員</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">姓名</th>
                  <th className="px-4 py-2">今日角色</th>
                  <th className="px-4 py-2">正物流</th>
                  <th className="px-4 py-2">逆物流</th>
                  <th className="px-4 py-2">是否已填寫</th>
                </tr>
              </thead>
              <tbody>
                {status.members.map((m) => (
                  <tr key={m.userId} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{m.userName}</td>
                    <td className="px-4 py-2">{roleLabels[m.role]}</td>
                    <td className="px-4 py-2">{m.forwardCount}</td>
                    <td className="px-4 py-2">{m.reverseCount}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-1 text-xs ${
                          m.hasSubmitted ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {m.hasSubmitted ? "已填寫" : "未填寫"}
                      </span>
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

function MembersTab({ members }: { members: MyRegion["members"] }) {
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [salaries, setSalaries] = useState<EmployeeMonthlySalary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get<EmployeeMonthlySalary[]>("/salary", { params: { year, month } })
      .then(({ data }) => {
        if (active) setSalaries(data.filter((s) => memberIds.has(s.userId)));
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
  }, [year, month, memberIds]);

  function toggleExpanded(userId: string) {
    setExpanded((current) => (current === userId ? null : userId));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
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
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : salaries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無成員資料</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">姓名</th>
                  <th className="px-4 py-2">職稱判定</th>
                  <th className="px-4 py-2">出勤天數</th>
                  <th className="px-4 py-2">本月累計件數</th>
                  <th className="px-4 py-2">預估薪資</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((s) => (
                  <>
                    <tr key={s.userId} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium text-gray-800">{s.userName}</td>
                      <td className="px-4 py-2">
                        {titleLabels[s.titleCategory] ?? s.titleCategory}
                        {s.titleLevel ? `（${s.titleLevel === "HIGH" ? "高" : "低"}）` : ""}
                      </td>
                      <td className="px-4 py-2">{s.attendanceDays}</td>
                      <td className="px-4 py-2">{s.totalDeliveryCount}</td>
                      <td className="px-4 py-2 font-semibold">${s.totalSalary.toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(s.userId)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {expanded === s.userId ? "收合" : "明細"}
                        </button>
                      </td>
                    </tr>
                    {expanded === s.userId && (
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td colSpan={6} className="px-4 py-3">
                          {s.dailyDetails.length === 0 ? (
                            <p className="text-sm text-gray-500">本月尚無送件紀錄</p>
                          ) : (
                            <table className="w-full text-left text-xs">
                              <thead className="text-gray-500">
                                <tr>
                                  <th className="px-2 py-1">日期</th>
                                  <th className="px-2 py-1">今日角色</th>
                                  <th className="px-2 py-1">正物流</th>
                                  <th className="px-2 py-1">逆物流</th>
                                  <th className="px-2 py-1">當日件數</th>
                                  <th className="px-2 py-1">單價</th>
                                  <th className="px-2 py-1">小計</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.dailyDetails.map((d) => (
                                  <tr key={d.date} className="border-t border-gray-200">
                                    <td className="px-2 py-1">{d.date}</td>
                                    <td className="px-2 py-1">{roleLabels[d.role]}</td>
                                    <td className="px-2 py-1">{d.forwardCount}</td>
                                    <td className="px-2 py-1">{d.reverseCount}</td>
                                    <td className="px-2 py-1">{d.totalCount}</td>
                                    <td className="px-2 py-1">{d.rate}</td>
                                    <td className="px-2 py-1">{d.subtotal.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {s.formulaNotes && <p className="mt-2 text-xs text-gray-400">{s.formulaNotes}</p>}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function LeavesTab({ members }: { members: MyRegion["members"] }) {
  const [records, setRecords] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeaveStatus | "ALL">("PENDING");
  const [actingId, setActingId] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<LeaveRequest[]>("/leaves");
      setRecords(data.filter((r) => memberIds.has(r.userId)));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIds]);

  async function handleApprove(id: string) {
    setError(null);
    setActingId(id);
    try {
      await apiClient.patch(`/leaves/${id}/approve`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(id: string) {
    setError(null);
    setActingId(id);
    try {
      await apiClient.patch(`/leaves/${id}/reject`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  const filtered = filter === "ALL" ? records : records.filter((r) => r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {leaveFilterOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              filter === opt.value
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-100"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">成員</th>
                  <th className="px-4 py-2">日期</th>
                  <th className="px-4 py-2">原因</th>
                  <th className="px-4 py-2">狀態</th>
                  <th className="px-4 py-2">審核人</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{r.user?.name ?? "-"}</td>
                    <td className="px-4 py-2">{r.date.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-gray-500">{r.reason ?? "-"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-1 text-xs ${statusStyles[r.status]}`}>
                        {statusLabels[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{r.reviewerName ?? "-"}</td>
                    <td className="px-4 py-2">
                      {r.status === "PENDING" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actingId === r.id}
                            onClick={() => handleApprove(r.id)}
                            className="rounded-md border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-60"
                          >
                            核准
                          </button>
                          <button
                            type="button"
                            disabled={actingId === r.id}
                            onClick={() => handleReject(r.id)}
                            className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            拒絕
                          </button>
                        </div>
                      )}
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

function DispatchTab({ members }: { members: MyRegion["members"] }) {
  const [date, setDate] = useState(today());
  const [summary, setSummary] = useState<DispatchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

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

  const vehicles = (summary?.vehicles ?? [])
    .map((v) => ({ ...v, users: v.users.filter((u) => memberIds.has(u.userId)) }))
    .filter((v) => v.users.length > 0);
  const usersWithoutVehicle = (summary?.usersWithoutVehicle ?? []).filter((u) => memberIds.has(u.userId));

  return (
    <div className="space-y-4">
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
        ) : vehicles.length === 0 ? (
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
                {vehicles.map((v) =>
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
                        <select
                          value={u.role}
                          disabled={savingKey === u.userId}
                          onChange={(e) => handleRoleChange(u.userId, e.target.value as DailyRoleType)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="NONE">無</option>
                          <option value="TRUCK_DRIVER">貨車司機</option>
                          <option value="TRUCK_ATTENDANT">貨車隨車人員</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">{u.endMileage}</td>
                      <td className="px-4 py-2">{u.distance !== null ? `${u.distance} km` : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {usersWithoutVehicle.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
            其他人員（當日無車輛使用紀錄）
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
                {usersWithoutVehicle.map((u) => (
                  <tr key={u.userId} className="border-t border-gray-100">
                    <td className="px-4 py-2">{u.userName}</td>
                    <td className="px-4 py-2">
                      <select
                        value={u.role}
                        disabled={savingKey === u.userId}
                        onChange={(e) => handleRoleChange(u.userId, e.target.value as DailyRoleType)}
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="NONE">無</option>
                        <option value="TRUCK_DRIVER">貨車司機</option>
                        <option value="TRUCK_ATTENDANT">貨車隨車人員</option>
                      </select>
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
