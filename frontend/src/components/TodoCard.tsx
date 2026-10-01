import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, CircleCheck } from "lucide-react";
import { apiClient } from "../api/client";
import type { TodoItem } from "../api/types";

const LEVEL_STYLE: Record<TodoItem["level"], { dot: string; label: string }> = {
  urgent: { dot: "bg-red-500", label: "緊急" },
  normal: { dot: "bg-amber-500", label: "待處理" },
  info: { dot: "bg-blue-400", label: "提醒" },
};

// 首頁「我的待辦」：依身分彙整（自己的送件／申請、主管的審核與月結、車輛保養與證件），點一下直接到對應頁面
export function TodoCard() {
  const [todos, setTodos] = useState<TodoItem[] | null>(null);

  useEffect(() => {
    apiClient
      .get<{ todos: TodoItem[] }>("/home/todos")
      .then(({ data }) => setTodos(data.todos))
      .catch(() => setTodos([]));
  }, []);

  if (todos === null) return null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">我的待辦</h2>
        {todos.length > 0 && <span className="text-xs text-gray-400">{todos.length} 項</span>}
      </div>
      {todos.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-gray-500">
          <CircleCheck className="h-4 w-4 text-green-600" />
          目前沒有待辦事項
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {todos.map((t) => {
            const style = LEVEL_STYLE[t.level];
            return (
              <li key={t.key}>
                <Link to={t.to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${style.dot}`} aria-label={style.label} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${t.level === "urgent" ? "font-semibold text-gray-900" : "text-gray-800"}`}>
                      {t.title}
                    </span>
                    {t.detail && <span className="block truncate text-xs text-gray-500">{t.detail}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
