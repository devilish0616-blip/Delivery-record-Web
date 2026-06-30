import { useEffect, useRef, useState } from "react";
import { CalendarDays, List, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { Schedule, User } from "../../api/types";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}

// 子區域輸入框（含自動補全）
function SubAreaInput({
  value,
  onChange,
  suggestions,
  placeholder = "輸入小區域名稱",
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {filtered.map((s) => (
            <li
              key={s}
              onMouseDown={() => {
                onChange(s);
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-blue-50"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 新增 / 編輯排班 Modal
function ScheduleModal({
  dateKey,
  schedules,
  employees,
  subAreaSuggestions,
  onClose,
  onChanged,
  editingSchedule,
}: {
  dateKey: string;
  schedules: Schedule[];
  employees: User[];
  subAreaSuggestions: string[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  editingSchedule?: Schedule | null;
}) {
  const [batchMode, setBatchMode] = useState(false);
  const [employeeId, setEmployeeId] = useState(editingSchedule?.employeeId ?? "");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(
    editingSchedule ? [editingSchedule.employeeId] : []
  );
  const [subArea, setSubArea] = useState(editingSchedule?.subArea ?? "");
  const [note, setNote] = useState(editingSchedule?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineSubArea, setInlineSubArea] = useState("");
  const [inlineNote, setInlineNote] = useState("");
  const isEditing = !!editingSchedule;

  function toggleEmployee(id: string) {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    setError(null);
    if (!subArea.trim()) {
      setError("請輸入小區域名稱");
      return;
    }

    if (isEditing) {
      setSubmitting(true);
      try {
        await apiClient.put(`/schedules/${editingSchedule!.id}`, {
          subArea: subArea.trim(),
          note: note.trim() || null,
        });
        await onChanged();
        onClose();
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (batchMode) {
      if (selectedEmployeeIds.length === 0) {
        setError("請至少選擇一位員工");
        return;
      }
      setSubmitting(true);
      try {
        await apiClient.post("/schedules/bulk", {
          date: dateKey,
          subArea: subArea.trim(),
          note: note.trim() || null,
          employeeIds: selectedEmployeeIds,
        });
        await onChanged();
        setSelectedEmployeeIds([]);
        setSubArea("");
        setNote("");
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!employeeId) {
        setError("請選擇員工");
        return;
      }
      setSubmitting(true);
      try {
        await apiClient.post("/schedules", {
          date: dateKey,
          subArea: subArea.trim(),
          note: note.trim() || null,
          employeeId,
        });
        await onChanged();
        setEmployeeId("");
        setSubArea("");
        setNote("");
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    setError(null);
    try {
      await apiClient.delete(`/schedules/${id}`);
      await onChanged();
      setConfirmDelete(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  }

  async function handleInlineSave(id: string) {
    setError(null);
    try {
      await apiClient.put(`/schedules/${id}`, {
        subArea: inlineSubArea.trim(),
        note: inlineNote.trim() || null,
      });
      await onChanged();
      setInlineEditId(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">
            {isEditing ? "編輯排班" : dateKey} 排班
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 現有排班列表 */}
        {!isEditing && schedules.length > 0 && (
          <div className="mt-3 max-h-48 overflow-y-auto">
            <p className="mb-1.5 text-xs font-medium text-gray-500">當日排班</p>
            <ul className="space-y-1.5">
              {schedules.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm"
                >
                  {inlineEditId === s.id ? (
                    <>
                      <span className="w-20 flex-shrink-0 font-medium text-gray-700">
                        {s.employee?.name}
                      </span>
                      <SubAreaInput
                        value={inlineSubArea}
                        onChange={setInlineSubArea}
                        suggestions={subAreaSuggestions}
                      />
                      <input
                        type="text"
                        value={inlineNote}
                        onChange={(e) => setInlineNote(e.target.value)}
                        placeholder="備註"
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleInlineSave(s.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        儲存
                      </button>
                      <button
                        type="button"
                        onClick={() => setInlineEditId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-gray-700">{s.employee?.name}</span>
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                        {s.subArea}
                      </span>
                      {s.note && <span className="text-xs text-gray-400">{s.note}</span>}
                      <div className="ml-auto flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setInlineEditId(s.id);
                            setInlineSubArea(s.subArea);
                            setInlineNote(s.note ?? "");
                          }}
                          className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                          title="編輯"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {confirmDelete === s.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(s.id)}
                              disabled={deleting === s.id}
                              className="text-xs text-red-600 hover:underline disabled:opacity-60"
                            >
                              確認
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-gray-400"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(s.id)}
                            className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                            title="刪除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 新增表單 */}
        {!isEditing && (
          <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
            <span className="text-xs font-medium text-gray-500">新增方式</span>
            <button
              type="button"
              onClick={() => setBatchMode(false)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                !batchMode
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              單人
            </button>
            <button
              type="button"
              onClick={() => setBatchMode(true)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                batchMode
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              批次多人
            </button>
          </div>
        )}

        <div className="mt-3 space-y-3">
          {/* 員工選擇 */}
          {!isEditing && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {batchMode ? "選擇員工（可複選）" : "員工"}
              </label>
              {batchMode ? (
                <div className="max-h-36 overflow-y-auto rounded-md border border-gray-200 p-2">
                  {employees.map((emp) => (
                    <label
                      key={emp.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmployeeIds.includes(emp.id)}
                        onChange={() => toggleEmployee(emp.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <span className="text-sm text-gray-700">{emp.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">請選擇員工</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* 小區域 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">小區域名稱</label>
            <SubAreaInput
              value={subArea}
              onChange={setSubArea}
              suggestions={subAreaSuggestions}
            />
          </div>

          {/* 備註 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">備註（選填）</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="輸入備註"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            關閉
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {isEditing ? "儲存" : submitting ? "新增中..." : "新增排班"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SchedulePage() {
  const { user } = useAuth();
  const now = new Date();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [subAreaSuggestions, setSubAreaSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const loadedRef = useRef(false);

  async function loadSchedules() {
    setLoading(true);
    setError(null);
    try {
      const firstDay = `${year}-${pad(month)}-01`;
      const lastDay = new Date(year, month, 0);
      const lastDayStr = toDateKey(year, month, lastDay.getDate());
      const { data } = await apiClient.get<Schedule[]>("/schedules", {
        params: { from: firstDay, to: lastDayStr },
      });
      setSchedules(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMeta() {
    try {
      const [empRes, subAreaRes] = await Promise.all([
        apiClient.get<User[]>("/schedules/assignable-employees"),
        apiClient.get<string[]>("/schedules/sub-areas"),
      ]);
      setEmployees(empRes.data);
      setSubAreaSuggestions(subAreaRes.data);
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadMeta();
    }
  }, []);

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
  const cells: ({ day: number; dateKey: string } | null)[] = [];
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

  // 重整子區域建議（載入新排班後更新）
  async function handleChanged() {
    await loadSchedules();
    const { data } = await apiClient.get<string[]>("/schedules/sub-areas");
    setSubAreaSuggestions(data);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-gray-800">排班管理</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "calendar"
                ? "bg-blue-600 text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            月曆
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-blue-600 text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <List className="h-4 w-4" />
            列表
          </button>
        </div>
      </div>

      {/* 月份導航 */}
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

      {/* 月曆視圖 */}
      {view === "calendar" && (
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
            {loading
              ? Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="min-h-[100px] border-b border-r border-gray-100 p-1.5" />
                ))
              : cells.map((cell, i) => {
                  if (!cell) {
                    return (
                      <div key={i} className="min-h-[100px] border-b border-r border-gray-100 bg-gray-50" />
                    );
                  }
                  const daySchedules = schedulesByDate.get(cell.dateKey) ?? [];
                  const isToday = cell.dateKey === todayKey;
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedDate(cell.dateKey)}
                      className={`min-h-[100px] cursor-pointer border-b border-r border-gray-100 p-1.5 text-xs hover:bg-blue-50 ${
                        isToday ? "bg-blue-50" : ""
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <p className={`font-medium ${isToday ? "text-blue-600" : "text-gray-600"}`}>
                          {cell.day}
                        </p>
                        <Plus className="h-3 w-3 text-gray-300" />
                      </div>
                      <div className="space-y-0.5">
                        {daySchedules.slice(0, 4).map((s) => (
                          <p
                            key={s.id}
                            className="truncate rounded bg-green-100 px-1 py-0.5 text-green-800"
                          >
                            {s.employee?.name} · {s.subArea}
                          </p>
                        ))}
                        {daySchedules.length > 4 && (
                          <p className="text-gray-400">+{daySchedules.length - 4} 筆</p>
                        )}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      )}

      {/* 列表視圖 */}
      {view === "list" && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">載入中...</p>
          ) : schedules.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">本月無排班資料</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500">
                    <th className="px-4 py-2">日期</th>
                    <th className="px-4 py-2">員工</th>
                    <th className="px-4 py-2">小區域</th>
                    <th className="px-4 py-2">備註</th>
                    <th className="px-4 py-2">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {schedules.map((s) => (
                    <ListRow
                      key={s.id}
                      schedule={s}
                      subAreaSuggestions={subAreaSuggestions}
                      onChanged={handleChanged}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400">
        {user?.role === "REGION_MANAGER"
          ? "僅顯示您所屬區域的成員排班；點擊日期格子可新增或管理排班"
          : "點擊日期格子可新增或管理排班；支援同天批次新增多人"}
      </p>

      {/* 日期 Modal */}
      {(selectedDate || editingSchedule) && (
        <ScheduleModal
          dateKey={selectedDate ?? editingSchedule!.date.slice(0, 10)}
          schedules={selectedSchedules}
          employees={employees}
          subAreaSuggestions={subAreaSuggestions}
          onClose={() => {
            setSelectedDate(null);
            setEditingSchedule(null);
          }}
          onChanged={handleChanged}
          editingSchedule={editingSchedule}
        />
      )}
    </div>
  );
}

function ListRow({
  schedule,
  subAreaSuggestions,
  onChanged,
}: {
  schedule: Schedule;
  subAreaSuggestions: string[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [subArea, setSubArea] = useState(schedule.subArea);
  const [note, setNote] = useState(schedule.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.put(`/schedules/${schedule.id}`, {
        subArea: subArea.trim(),
        note: note.trim() || null,
      });
      await onChanged();
      setEditing(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    try {
      await apiClient.delete(`/schedules/${schedule.id}`);
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-4 py-2 text-gray-700">{formatDate(schedule.date)}</td>
        <td className="px-4 py-2 text-gray-700">{schedule.employee?.name}</td>
        <td className="px-4 py-2">
          <SubAreaInput value={subArea} onChange={setSubArea} suggestions={subAreaSuggestions} />
        </td>
        <td className="px-4 py-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="text-xs text-blue-600 hover:underline disabled:opacity-60"
            >
              儲存
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setSubArea(schedule.subArea); setNote(schedule.note ?? ""); }}
              className="text-xs text-gray-400"
            >
              取消
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2 text-gray-700">{formatDate(schedule.date)}</td>
      <td className="px-4 py-2 font-medium text-gray-800">{schedule.employee?.name}</td>
      <td className="px-4 py-2">
        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
          {schedule.subArea}
        </span>
      </td>
      <td className="px-4 py-2 text-gray-500">{schedule.note ?? "-"}</td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <Pencil className="h-3 w-3" />
            編輯
          </button>
          {confirming ? (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="text-xs text-red-600 hover:underline"
              >
                確認刪除
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs text-gray-400"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1 text-xs text-red-500 hover:underline"
            >
              <Trash2 className="h-3 w-3" />
              刪除
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
