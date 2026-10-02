import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type {
  Announcement,
  CalendarData,
  CalendarEvent,
  CalendarLeaveEntry,
} from "../api/types";
import { TodoCard } from "../components/TodoCard";
import { InstallAppCard } from "../components/InstallAppCard";

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

  // 車輛待辦提醒（ADMIN/MANAGER）

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
      const { data } = await apiClient.get<CalendarData>("/events", { params: { year, month } });
      setCalendarData(data);
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

  const todayKey = toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());

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

      <InstallAppCard />
      <TodoCard />

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

        {/* 手機上整個月放得下一個畫面（格子變矮、活動改成小圓點，點日期看明細）；平板以上照原本顯示文字 */}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="grid grid-cols-7 sm:min-w-[640px]">
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
                  <div key={i} className="min-h-[56px] border-b border-r border-gray-100 p-1.5 sm:min-h-[100px]" />
                ))
              : cells.map((cell, i) => {
                  if (!cell) {
                    return (
                      <div key={i} className="min-h-[56px] border-b border-r border-gray-100 bg-gray-50 sm:min-h-[100px]" />
                    );
                  }
                  const dayEvents = eventsByDate.get(cell.dateKey) ?? [];
                  const dayLeaves = leavesByDate.get(cell.dateKey) ?? [];
                  const isToday = cell.dateKey === todayKey;
                  const hasContent = dayEvents.length > 0 || dayLeaves.length > 0;

                  return (
                    <div
                      key={i}
                      onClick={() => (hasContent || canEdit) && setSelectedDate(cell.dateKey)}
                      className={`min-h-[56px] border-b border-r border-gray-100 p-1.5 text-xs transition-colors sm:min-h-[100px] ${
                        hasContent || canEdit ? "cursor-pointer hover:bg-blue-50" : ""
                      } ${isToday ? "bg-blue-50" : ""}`}
                    >
                      <p className={`mb-1 font-medium ${isToday ? "text-blue-600" : "text-gray-600"}`}>
                        {cell.day}
                      </p>
                      {hasContent && (
                        <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                          {dayEvents.map((e) => (
                            <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          ))}
                          {dayLeaves.map((l) => (
                            <span key={l.id} className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          ))}
                        </div>
                      )}
                      <div className="hidden space-y-0.5 sm:block">
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
          {canEdit && <span>點擊日期可新增或刪除活動</span>}
          {!canEdit && <span>點擊日期可查看當天的請假與活動</span>}
        </div>
      </div>

      {selectedDate && (
        <DayDetailModal
          dateKey={selectedDate}
          events={eventsByDate.get(selectedDate) ?? []}
          leaves={leavesByDate.get(selectedDate) ?? []}
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
  canEdit,
  onClose,
  onChanged,
}: {
  dateKey: string;
  events: CalendarEvent[];
  leaves: CalendarLeaveEntry[];
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

        {leaves.length === 0 && events.length === 0 && !canEdit && (
          <p className="mb-3 text-sm text-gray-400">這天沒有請假或活動紀錄</p>
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
