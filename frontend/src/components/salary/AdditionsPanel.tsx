import { useState } from "react";
import { Gift, HandCoins, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { SalaryAdditionItem } from "../../api/types";
import { PresetChips, type ChipOption } from "../PresetChips";

// 加項分類快選（只是預填原因文字，後端只存金額與原因）
const ADDITION_CATEGORIES: (ChipOption & { template: string })[] = [
  { key: "bonus", label: "獎金", icon: Gift, template: "獎金" },
  { key: "backpay", label: "補發", icon: RotateCcw, template: "補發上月薪資" },
  { key: "refund", label: "代墊還款", icon: HandCoins, template: "代墊費用還款" },
  { key: "other", label: "其他", icon: MoreHorizontal, template: "" },
];

// 薪資加項：一次性獎金、補發、代墊還款…；跟扣款一樣按月份登記，封存後不能改
export function AdditionsPanel({
  userId,
  year,
  month,
  locked,
  additions,
  total,
  onChanged,
}: {
  userId: string;
  year: number;
  month: number;
  locked: boolean;
  additions: SalaryAdditionItem[];
  total: number;
  onChanged: () => Promise<void> | void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectCategory(key: string) {
    const next = category === key ? null : key;
    setCategory(next);
    setReason(ADDITION_CATEGORIES.find((c) => c.key === next)?.template ?? "");
    setAmount("");
    setError(null);
  }

  async function handleSubmit() {
    const value = Number(amount);
    if (!(value > 0)) return setError("請輸入大於 0 的金額");
    if (!reason.trim()) return setError("請寫下加項原因");
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post("/salary/additions", { userId, year, month, amount: value, reason: reason.trim() });
      setCategory(null);
      setAmount("");
      setReason("");
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.delete(`/salary/additions/${id}`);
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">加項</h4>
        <span className="font-mono text-sm font-bold text-green-700">{total > 0 ? `+$${total.toLocaleString()}` : "$0"}</span>
      </div>
      {error && <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

      {additions.length === 0 ? (
        <div className="rounded-md bg-gray-50 py-3 text-center text-xs text-gray-400">本月無加項</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {additions.map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-2">
              <p className="min-w-0 flex-1 text-xs text-gray-700">{a.reason}</p>
              <span className="whitespace-nowrap font-mono text-sm font-bold text-green-700">+${a.amount.toLocaleString()}</span>
              {!locked && (
                <button
                  type="button"
                  aria-label="刪除加項"
                  onClick={() => handleDelete(a.id)}
                  className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-white hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!locked && (
        <div className="mt-3">
          <PresetChips options={ADDITION_CATEGORIES} selected={category} onSelect={selectCategory} />
          {category && (
            <div className="mt-2.5 flex flex-wrap items-end gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="w-28">
                <label htmlFor="addition-amount" className="mb-1 block text-[11px] text-gray-500">金額</label>
                <input
                  id="addition-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="min-w-[10rem] flex-1">
                <label htmlFor="addition-reason" className="mb-1 block text-[11px] text-gray-500">原因</label>
                <input
                  id="addition-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {submitting ? "新增中..." : "新增加項"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
