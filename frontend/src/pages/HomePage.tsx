import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Announcement, CalendarData, CalendarEvent, CalendarLeaveEntry, Schedule } from "../api/types";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

interface DayCell {
  day: number;
  dateKey: string;
}

export function HomePage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";

  // 公告欄
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [announcementLoading, setAnnouncementLoading] = useState(true);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [announcementSaving, setAnnouncementSaving] = useState(false);

  // 行事曆
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 月份排班
  const [monthSchedules, setMonthSchedules] = useState<Schedule[]>([]);

  async function loadAnnouncement() {
    setAnnouncementLoading(true);
    try {
      const { data } = await apiClient.get<Announcement>("/announcement");
      setAnnouncement(data);
    } catch (err) {
      setAnnouncementError(getErrorMessage(err));
    } finally {
      setAnnouncementLoading(false);
    }
  }

  async function loadCalendar() {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const [calRes, schRes] = await Promise.all([
        apiClient.get<CalendarData>("/events", { params: { year, month } }),
        apiClient.get<Schedule[]>("/schedules/calendar", { params: { year, month } }),
      ]);
      setCalendarData(calRes.data);
      setMonthSchedules(schRes.data);
    } catch (err) {
      setCalendarError(getErrorMessage(err));
    } finally {
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    loadAnnouncement();
  }, []);

  useEffect(() => {
    loadCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  function startEditAnnouncement() {
    setAnnouncementDraft(announcement?.content ?? "");
    setAnnouncementError(null);
    setEditingAnnouncement(true);
  }

  async function saveAnnouncement() {
    setAnnouncementSaving(true);
    setAnnouncementError(null);
    try {
      const { data } = await apiClient.put<Announcement>("/announcement", {
        content: announcementDraft,
      });
      setAnnouncement(data);
      setEditingAnnouncement(false);
    } catch (err) {
      setAnnouncementError(getErrorMessage(err));
    } finally {
      setAnnouncementSaving(false);
    }
  }

  function goToMonth(y: number, m: number) {
    if (m < 1) {
      setYear(y - 1);
      setMonth(12);
    } else if (m > 12) {
      setYear(y + 1);
      setMonth(1);
    } else {
      setYear(y);
      setMonth(m);
    }
  }

  // 建立行事曆格子
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateKey: toDateKey(year, month, d) });
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDate = new Map<string, CalendarEvent[]>();
  const leavesByDate = new Map<string, CalendarLeaveEntry[]>();
  const schedulesByDate = new Map<string, Schedule[]>();

  if (calendarData) {
    for (const e of calendarData.events) {
      const key = e.date.slice(0, 10);
      if (!eventsByDate.has(key)) eventsByDate.set(key, []);
      eventsByDate.get(key)!.push(e);
    }
    for (const l of calendarData.leaves) {
      const key = l.date.slice(0, 10);
      if (!leavesByDate.has(key)) leavesByDate.set(key, []);
      leavesByDate.get(key)!.push(l);
    }
  }
  for (const s of monthSchedules) {
    const key = s.date.slice(0, 10);
    if (!schedulesByDate.has(key)) schedulesByDate.set(key, []);
    schedulesByDate.get(key)!.push(s);
  }

  const todayKey = toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // 員工今日排班（從月份資料過濾）
  const myTodaySchedules = monthSchedules.filter(
    (s) => s.date.slice(0, 10) === todayKey && s.employeeId === user?.id
  );

  // 員工未來 6 天排班（今天之後）
  const myUpcoming = monthSchedules
    .filter((s) => s.date.slice(0, 10) > todayKey && s.employeeId === user?.id)
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* 公告欄 */}
      <div>
        <h1 className="mb-3 text-xl font-semibold text-gray-800">公告欄</h1>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          {announcementLoading ? (
            <p className="text-sm text-gray-500">載入中...</p>
          ) : editingAnnouncement ? (
            <div className="space-y-3">
              <textarea
                value={announcementDraft}
                onChange={(e) => setAnnouncementDraft(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="輸入公告內容..."
              />
              {announcementError && <p className="text-sm text-red-600">{announcementError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAnnouncement(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={announcementSaving}
                  onClick={saveAnnouncement}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {announcementSaving ? "儲存中..." : "儲存"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {announcementError && <p className="mb-2 text-sm text-red-600">{announcementError}</p>}
              {announcement?.content ? (
                <p className="whitespace-pre-wrap text-sm text-gray-800">{announcement.content}</p>
              ) : (
                <p className="text-sm text-gray-400">目前沒有公告</p>
              )}
              {announcement?.updatedAt && (
                <p className="mt-2 text-xs text-gray-400">
                  最後更新：{announcement.updatedBy ?? "-"}・
                  {new Date(announcement.updatedAt).toLocaleString("zh-TW")}
                </p>
              )}
              {canEdit && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={startEditAnnouncement}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    編輯公告
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 行事曆 */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-gray-800">
            {year} 年 {month} 月 行事曆
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

        {calendarError && <p className="mb-2 text-sm text-red-600">{calendarError}</p>}

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="grid min-w-[640px] grid-cols-7">
            {weekdayLabels.map((w) => (
              <div
                key={w}
                className="border-b border-gray-200 bg-gray-50 px-2 py-2 text-center text-xs font-medium text-gray-500"
              >
                {w}
              </div>
            ))}
            {calendarLoading
              ? Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="min-h-[100px] border-b border-r border-gray-100 p-1.5" />
                ))
              : cells.map((cell, i) => {
                  if (!cell) {
                    return (
                      <div key={i} className="min-h-[100px] border-b border-r border-gray-100 bg-gray-50" />
                    );
                  }
                  const dayEvents = eventsByDate.get(cell.dateKey) ?? [];
                  const dayLeaves = leavesByDate.get(cell.dateKey) ?? [];
                  const daySchedules = schedulesByDate.get(cell.dateKey) ?? [];
                  const isToday = cell.dateKey === todayKey;
                  const hasContent = dayEvents.length > 0 || dayLeaves.length > 0 || daySchedules.length > 0;

                  // 格子最多顯示 2 筆排班，超過顯示 +N
                  const visibleSchedules = daySchedules.slice(0, 2);
                  const hiddenCount = daySchedules.length - visibleSchedules.length;

                  return (
                    <div
                      key={i}
                      onClick={() => (hasContent || canEdit) && setSelectedDate(cell.dateKey)}
                      className={`min-h-[100px] border-b border-r border-gray-100 p-1.5 text-xs transition-colors ${
                        hasContent || canEdit ? "cursor-pointer hover:bg-blue-50" : ""
                      } ${isToday ? "bg-blue-50" : ""}`}
                    >
                      <p className={`mb-1 font-medium ${isToday ? "text-blue-600" : "text-gray-600"}`}>
                        {cell.day}
                      </p>
                      <div className="space-y-0.5">
                        {dayEvents.map((e) => (
                          <p key={e.id} className="truncate rounded bg-blue-100 px-1 py-0.5 text-blue-700">
                            {e.title}
                          </p>
                        ))}
                        {dayLeaves.map((l) => (
                          <p key={l.id} className="truncate rounded bg-amber-100 px-1 py-0.5 text-amber-700">
                            {l.userName} 假
                          </p>
                        ))}
                        {visibleSchedules.map((s) => (
                          <p key={s.id} className="truncate rounded bg-green-100 px-1 py-0.5 text-green-700">
                            {s.employee?.name && <span className="font-medium">{s.employee.name}</span>}
                            {s.employee?.name && "·"}
                            {s.subArea}
                          </p>
                        ))}
                        {hiddenCount > 0 && (
                          <p className="px-1 py-0.5 text-gray-400">+{hiddenCount} 人</p>
                        )}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>

        {/* 圖例 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded bg-blue-200" />
            公司活動
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded bg-amber-200" />
            請假
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded bg-green-200" />
            排班
          </span>
          {canEdit && <span>點擊日期可新增或刪除活動</span>}
          {!canEdit && <span>點擊日期可查看詳細排班</span>}
        </div>
      </div>

      {/* 我的排班快速欄（員工）/ 今日全隊概覽（管理者）*/}
      {user?.role === "EMPLOYEE" && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">我的排班</h2>
            <Link to="/my-schedule" className="text-xs text-blue-600 hover:underline">
              查看全部 →
            </Link>
          </div>
          {calendarLoading ? (
            <p className="px-4 py-3 text-sm text-gray-400">載入中...</p>
          ) : myTodaySchedules.length === 0 && myUpcoming.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">本月尚無排班</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {myTodaySchedules.map((s) => {
                const d = new Date(`${s.date.slice(0, 10)}T00:00:00Z`);
                const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getUTCDay()];
                return (
                  <li key={s.id} className="flex items-center gap-3 bg-green-50 px-4 py-2.5">
                    <span className="flex-shrink-0 text-xs font-semibold text-green-700">
                      今天（{weekday}）
                    </span>
                    <span className="font-medium text-green-800">{s.subArea}</span>
                    {s.region && <span className="text-xs text-gray-400">{s.region.name}</span>}
                    {s.note && <span className="ml-auto text-xs text-gray-400">{s.note}</span>}
                  </li>
                );
              })}
              {myUpcoming.map((s) => {
                const dk = s.date.slice(0, 10);
                const d = new Date(`${dk}T00:00:00Z`);
                const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getUTCDay()];
                const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${weekday}）`;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="flex-shrink-0 w-20 text-xs text-gray-500">{label}</span>
                    <span className="text-sm text-gray-700">{s.subArea}</span>
                    {s.region && <span className="text-xs text-gray-400">{s.region.name}</span>}
                    {s.note && <span className="ml-auto text-xs text-gray-400">{s.note}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {selectedDate && (
        <DayDetailModal
          dateKey={selectedDate}
          events={eventsByDate.get(selectedDate) ?? []}
          leaves={leavesByDate.get(selectedDate) ?? []}
          schedules={schedulesByDate.get(selectedDate) ?? []}
          canEdit={canEdit}
          onClose={() => setSelectedDate(null)}
          onChanged={loadCalendar}
        />
      )}
    </div>
  );
}

function DayDetailModal({
  dateKey,
  events,
  leaves,
  schedules,
  canEdit,
  onClose,
  onChanged,
}: {
  dateKey: string;
  events: CalendarEvent[];
  leaves: CalendarLeaveEntry[];
  schedules: Schedule[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post("/events", { date: dateKey, title: title.trim() });
      setTitle("");
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/events/${id}`);
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const [y, m, d] = dateKey.split("-");
  const dateLabel = `${Number(y)} 年 ${Number(m)} 月 ${Number(d)} 日`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <h3 className="mb-4 text-base font-semibold text-gray-800">{dateLabel}</h3>

        {/* 排班 */}
        {schedules.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 text-sm font-medium text-gray-700">排班人員</p>
            <ul className="space-y-1">
              {schedules.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-green-800">{s.employee?.name ?? "-"}</span>
                  <span className="text-green-500">·</span>
                  <span className="text-green-700">{s.subArea}</span>
                  {s.region && (
                    <span className="ml-auto text-xs text-gray-400">{s.region.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 請假 */}
        {leaves.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 text-sm font-medium text-gray-700">請假人員</p>
            <ul className="space-y-1">
              {leaves.map((l) => (
                <li key={l.id} className="rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                  {l.userName}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 公司活動 */}
        <div className="mb-4">
          <p className="mb-1.5 text-sm font-medium text-gray-700">公司活動</p>
          {events.length === 0 ? (
            <p className="text-sm text-gray-400">尚無活動</p>
          ) : (
            <ul className="space-y-1">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded-md bg-blue-50 px-3 py-1.5 text-sm text-blue-800"
                >
                  <span>{e.title}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      className="ml-3 text-xs text-red-500 hover:underline"
                    >
                      刪除
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 新增活動（僅限管理者） */}
        {canEdit && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">新增活動</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="輸入活動名稱"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={submitting || !title.trim()}
                onClick={handleAdd}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                新增
              </button>
            </div>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {schedules.length === 0 && leaves.length === 0 && events.length === 0 && !canEdit && (
          <p className="mb-3 text-sm text-gray-400">這天沒有排班、請假或活動紀錄</p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
