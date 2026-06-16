import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { Schedule } from "../../api/types";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

interface DayCell {
  day: number;
  dateKey: string;
}

export function MySchedulePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  async function loadSchedules() {
    setLoading(true);
    setError(null);
    try {
      const firstDay = `${year}-${pad(month)}-01`;
      const lastDate = new Date(year, month, 0).getDate();
      const lastDay = toDateKey(year, month, lastDate);
      const { data } = await apiClient.get<Schedule[]>("/schedules/my", {
        params: { from: firstDay, to: lastDay },
      });
      setSchedules(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  function goToMonth(y: number, m: number) {
    if (m < 1) { setYear(y - 1); setMonth(12); }
    else if (m > 12) { setYear(y + 1); setMonth(1); }
    else { setYear(y); setMonth(m); }
  }

  // 建立月曆格子
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateKey: toDateKey(year, month, d) });
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const schedulesByDate = new Map<string, Schedule[]>();
  for (const s of schedules) {
    const key = s.date.slice(0, 10);
    if (!schedulesByDate.has(key)) schedulesByDate.set(key, []);
    schedulesByDate.get(key)!.push(s);
  }

  const selectedSchedules = selectedDate ? (schedulesByDate.get(selectedDate) ?? []) : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">我的排班</h1>
        <p className="mt-1 text-sm text-gray-500">查看您本月的派駐小區域安排</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-gray-700">
          {year} 年 {month} 月
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => goToMonth(year, month - 1)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            ‹ 上個月
          </button>
          <button
            type="button"
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            本月
          </button>
          <button
            type="button"
            onClick={() => goToMonth(year, month + 1)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            下個月 ›
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="grid min-w-[560px] grid-cols-7">
          {weekdayLabels.map((w) => (
            <div
              key={w}
              className="border-b border-gray-200 bg-gray-50 px-2 py-2 text-center text-xs font-medium text-gray-500"
            >
              {w}
            </div>
          ))}
          {loading
            ? Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="min-h-[80px] border-b border-r border-gray-100 p-1.5" />
              ))
            : cells.map((cell, i) => {
                if (!cell) {
                  return (
                    <div key={i} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50" />
                  );
                }
                const daySchedules = schedulesByDate.get(cell.dateKey) ?? [];
                const isToday = cell.dateKey === todayKey;
                const hasSchedule = daySchedules.length > 0;
                return (
                  <div
                    key={i}
                    onClick={() => hasSchedule && setSelectedDate(cell.dateKey)}
                    className={`min-h-[80px] border-b border-r border-gray-100 p-1.5 text-xs ${
                      hasSchedule ? "cursor-pointer hover:bg-green-50" : ""
                    } ${isToday ? "bg-blue-50" : ""}`}
                  >
                    <p className={`mb-1 font-medium ${isToday ? "text-blue-600" : "text-gray-600"}`}>
                      {cell.day}
                    </p>
                    <div className="space-y-0.5">
                      {daySchedules.map((s) => (
                        <p
                          key={s.id}
                          className="truncate rounded bg-green-100 px-1 py-0.5 text-green-800"
                        >
                          {s.subArea}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
        </div>
      </div>

      <p className="text-xs text-gray-400">綠色標記為已排班日期；點擊可查看詳細資訊</p>

      {/* 統計 */}
      {!loading && schedules.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-700">本月排班共 {schedules.length} 天</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from(
              schedules.reduce((acc, s) => {
                acc.set(s.subArea, (acc.get(s.subArea) ?? 0) + 1);
                return acc;
              }, new Map<string, number>())
            ).map(([area, count]) => (
              <span
                key={area}
                className="rounded-full bg-green-100 px-2.5 py-1 text-xs text-green-800"
              >
                {area} × {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 日期詳細 Modal */}
      {selectedDate && selectedSchedules.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-800">{selectedDate} 排班詳情</h3>
            <div className="mt-3 space-y-3">
              {selectedSchedules.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-green-200 bg-green-50 p-3"
                >
                  <p className="font-medium text-green-800">{s.subArea}</p>
                  {s.note && (
                    <p className="mt-1 text-sm text-gray-600">備註：{s.note}</p>
                  )}
                  {s.region && (
                    <p className="mt-1 text-xs text-gray-400">區域：{s.region.name}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
