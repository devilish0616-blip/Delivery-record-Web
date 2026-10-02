import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { ClosingChecklist, ClosingStep } from "../../api/types";
import { YearMonthPicker } from "../YearMonthPicker";

function previousMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const MARK: Record<ClosingStep["status"], string> = {
  done: "bg-green-600 text-white",
  todo: "border border-amber-500 bg-amber-50 text-amber-700",
  waiting: "border border-gray-300 bg-gray-50 text-gray-400",
  skip: "border border-gray-200 bg-white text-gray-300",
};

const STATUS_LABEL: Record<ClosingStep["status"], string> = {
  done: "完成",
  todo: "要處理",
  waiting: "建議等前面做完",
  skip: "這個月不用",
};

// 營運總覽「月底結算」（董事長）：月底要跑的幾個頁面照順序列出，系統自己檢查每一步做了沒
export function ClosingPanel() {
  const [ym, setYm] = useState(previousMonth);
  const [data, setData] = useState<ClosingChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const key = `${ym.year}-${ym.month}`;
  const loading = loadedKey !== key;

  useEffect(() => {
    let active = true;
    apiClient
      .get<ClosingChecklist>("/closing", { params: ym })
      .then(({ data: d }) => {
        if (!active) return;
        setData(d);
        setError(null);
      })
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoadedKey(`${ym.year}-${ym.month}`));
    return () => {
      active = false;
    };
  }, [ym]);

  const pct = data && data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">每一步都是系統即時檢查的，做完回來重新整理就會打勾。</p>
        <YearMonthPicker year={ym.year} month={ym.month} onChange={(year, month) => setYm({ year, month })} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && loading && <p className="text-sm text-gray-500">載入中...</p>}

      {data && (
        <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-gray-800">
              {data.year} 年 {data.month} 月結算
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-sm text-gray-600">
              {data.done} / {data.total}
            </span>
          </div>

          <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
            {data.steps.map((s, i) => (
              <li key={s.key} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${MARK[s.status]}`}
                  aria-label={STATUS_LABEL[s.status]}
                  title={STATUS_LABEL[s.status]}
                >
                  {s.status === "done" ? <Check className="h-3.5 w-3.5" /> : s.status === "todo" ? "!" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${s.status === "skip" || s.status === "waiting" ? "text-gray-500" : "font-medium text-gray-900"}`}>
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{s.detail}</p>
                </div>
                <Link
                  to={s.to}
                  className={`flex-shrink-0 text-sm ${s.status === "todo" ? "font-medium text-blue-600" : "text-gray-500"} hover:underline`}
                >
                  {s.action} →
                </Link>
              </li>
            ))}
          </ol>
          <p className="text-xs text-gray-400">
            這份清單只是把月底要跑的頁面串在一起，實際操作（審核、封存、帶入）都在原本的頁面完成，流程沒有改變。
          </p>
        </div>
      )}
    </div>
  );
}
