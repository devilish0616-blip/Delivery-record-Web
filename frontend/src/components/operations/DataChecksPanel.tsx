import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { DataCheckItem, DataChecks } from "../../api/types";

function md(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

const FIX_LABEL: Record<DataCheckItem["kind"], string> = {
  "delivery-high": "去修正",
  "delivery-low": "去修正",
  "mileage-back": "去修正",
  "mileage-jump": "去修正",
  "fuel-rate": "看這台車",
  "fuel-duplicate": "去審核",
  "parking-duplicate": "去審核",
};

// 營運總覽「資料檢查」：系統每次打開時用最近的資料自動檢查，列出可能打錯的件數、里程與報帳；
// 確認沒問題按「沒問題」收起來（資料改過會重新檢查）
export function DataChecksPanel({ checks, onChanged }: { checks: DataChecks | null; onChanged: () => void }) {
  const [showDismissed, setShowDismissed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!checks) return <p className="text-sm text-gray-500">載入中...</p>;

  const open = checks.items.filter((i) => !i.dismissed);
  const dismissed = checks.items.filter((i) => i.dismissed);
  const list = showDismissed ? dismissed : open;

  async function toggle(item: DataCheckItem) {
    setBusyKey(item.key);
    setError(null);
    try {
      await apiClient.post(item.dismissed ? "/checks/undismiss" : "/checks/dismiss", { key: item.key });
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          檢查 {md(checks.from)}～{md(checks.to)} 的資料：件數跟本人平常差很多、里程倒退或一天開太多、每公里油錢暴增、同一天重複報帳。
        </p>
        {dismissed.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            {showDismissed ? `回到待確認（${open.length}）` : `看已確認沒問題的（${dismissed.length}）`}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {list.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600">
          <CircleCheck className="h-5 w-5 text-green-600" />
          {showDismissed ? "沒有已確認的項目" : "目前沒有可疑的資料"}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
          {list.map((item) => (
            <li key={item.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-black ${
                  item.dismissed
                    ? "bg-gray-100 text-gray-400"
                    : item.level === "urgent"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                }`}
                aria-label={item.level === "urgent" ? "可能影響薪資或里程，請優先確認" : "請確認"}
              >
                !
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${item.dismissed ? "text-gray-500" : "font-medium text-gray-900"}`}>{item.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">{item.detail}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                {!item.dismissed && (
                  <Link to={item.to} className="text-sm font-medium text-blue-600 hover:underline">
                    {FIX_LABEL[item.kind]}
                  </Link>
                )}
                <button
                  type="button"
                  disabled={busyKey === item.key}
                  onClick={() => toggle(item)}
                  className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  {item.dismissed ? "取消確認" : "沒問題"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400">
        「去修正」會打開可以改這筆資料的頁面（件數在薪資的每日明細、里程在送件與派車）。改好之後這一項會自動消失；確認資料本來就對的話按「沒問題」。
      </p>
    </div>
  );
}
