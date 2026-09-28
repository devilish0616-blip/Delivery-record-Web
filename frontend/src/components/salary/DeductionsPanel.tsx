import { useState } from "react";
import { Trash2 } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { SalaryDeductionItem } from "../../api/types";
import { DEDUCTION_CATEGORIES, findDeductionCategory } from "../../constants/deductionCategories";
import { formatDeductionReason, parseDeductionReason } from "../../utils/deductionReason";
import { addMonths, computeInstallments } from "../../utils/installments";
import { PresetChips } from "../PresetChips";

function ym(year: number, month: number): string {
  return `${year}年${month}月`;
}

// 扣款事項填寫介面：分類快選 chip → 金額／原因 → 可選「分期付款」拆成多期，
// 分期會依起始月份逐月呼叫既有的 /salary/deductions 端點分別建立（後端本身沒有分期概念，
// 純粹是前端連續建立多筆不同年月的紀錄），本月只會顯示屬於本月那一期。
export function DeductionsPanel({
  userId,
  year,
  month,
  locked,
  deductions,
  dedTotal,
  onChanged,
}: {
  userId: string;
  year: number;
  month: number;
  locked: boolean;
  deductions: SalaryDeductionItem[];
  dedTotal: number;
  onChanged: () => Promise<void> | void;
}) {
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [reasonText, setReasonText] = useState<string | undefined>(undefined);
  const [installmentOn, setInstallmentOn] = useState(false);
  const [count, setCount] = useState(3);
  const [startOffset, setStartOffset] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  function resetForm() {
    setPendingCategory(null);
    setAmount(0);
    setReasonText(undefined);
    setInstallmentOn(false);
    setCount(3);
    setStartOffset(0);
    setFormError(null);
  }

  function selectCategory(key: string) {
    setPendingCategory((cur) => (cur === key ? null : key));
    setAmount(0);
    setReasonText(undefined);
    setInstallmentOn(false);
    setCount(3);
    setStartOffset(0);
    setFormError(null);
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.delete(`/salary/deductions/${id}`);
      await onChanged();
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  }

  async function handleSubmit() {
    if (!pendingCategory) return;
    if (amount <= 0) {
      setFormError("請輸入大於 0 的金額");
      return;
    }
    setFormError(null);
    setBanner(null);
    setSubmitting(true);
    const text = reasonText !== undefined ? reasonText : findDeductionCategory(pendingCategory).template;
    try {
      if (!installmentOn) {
        await apiClient.post("/salary/deductions", {
          userId,
          year,
          month,
          amount,
          reason: formatDeductionReason(pendingCategory, text),
        });
        setBanner(`已新增扣款：$${amount.toLocaleString()}`);
      } else {
        const start = addMonths(year, month, startOffset);
        const periods = computeInstallments(amount, count, start.year, start.month);
        const failed: string[] = [];
        for (const p of periods) {
          try {
            await apiClient.post("/salary/deductions", {
              userId,
              year: p.year,
              month: p.month,
              amount: p.amount,
              reason: formatDeductionReason(pendingCategory, text, { index: p.index, total: p.total }),
            });
          } catch (err) {
            failed.push(`${ym(p.year, p.month)}（${getErrorMessage(err)}）`);
          }
        }
        if (failed.length === 0) {
          setBanner(
            `已建立分期扣款：${startOffset === 0 ? "本月起" : `${ym(start.year, start.month)} 起`}共 ${count} 期，總額 $${amount.toLocaleString()}`
          );
        } else {
          setBanner(`部分分期建立失敗，請確認以下月份是否已封存：${failed.join("、")}`);
        }
      }
      resetForm();
      await onChanged();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const start = addMonths(year, month, startOffset);
  const preview = amount > 0 ? computeInstallments(amount, count, start.year, start.month) : [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">扣款事項</h4>
        <span className="font-mono text-sm font-bold text-red-600">
          {dedTotal > 0 ? `-$${dedTotal.toLocaleString()}` : "$0"}
        </span>
      </div>

      {banner && <div className="mb-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">{banner}</div>}
      {formError && <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</div>}

      {deductions.length === 0 ? (
        <div className="rounded-md bg-gray-50 py-3 text-center text-xs text-gray-400">本月無扣款項目</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {deductions.map((d) => {
            const parsed = parseDeductionReason(d.reason);
            const Icon = parsed.category.icon;
            return (
              <div
                key={d.id}
                className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-red-200 bg-white text-red-600">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-red-600">{parsed.category.label}</span>
                    {parsed.installment && (
                      <span className="rounded-full border border-red-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                        分期 {parsed.installment.index}/{parsed.installment.total}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-600">{parsed.text}</p>
                </div>
                <span className="whitespace-nowrap font-mono text-sm font-bold text-red-600">
                  -${d.amount.toLocaleString()}
                </span>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id)}
                    className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-white hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!locked && (
        <div className="mt-3">
          <PresetChips options={DEDUCTION_CATEGORIES} selected={pendingCategory} onSelect={selectCategory} />

          {pendingCategory && (
            <div className="mt-2.5 flex flex-col gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex gap-2.5">
                <div className="w-32">
                  <label className="mb-1 block text-[11px] text-gray-500">金額</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-gray-400">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amount || ""}
                      placeholder="0"
                      onChange={(e) => setAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                      className="w-full rounded-md border border-gray-300 py-1.5 pl-5 pr-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] text-gray-500">原因</label>
                  <input
                    type="text"
                    value={reasonText !== undefined ? reasonText : findDeductionCategory(pendingCategory).template}
                    onChange={(e) => setReasonText(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md px-0.5 py-1">
                <div>
                  <p className="text-xs font-semibold text-gray-700">分期付款</p>
                  <p className="text-[11px] text-gray-400">將總金額拆成多期，於未來月份逐月扣款</p>
                </div>
                <button
                  type="button"
                  onClick={() => setInstallmentOn((v) => !v)}
                  className={`relative h-5.5 w-9 flex-shrink-0 rounded-full transition-colors ${
                    installmentOn ? "bg-blue-600" : "bg-gray-300"
                  }`}
                  style={{ height: 22 }}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
                    style={{ left: installmentOn ? 18 : 2 }}
                  />
                </button>
              </div>

              {installmentOn && (
                <div className="flex flex-col gap-2.5 border-t border-dashed border-gray-300 pt-2.5">
                  <div className="flex gap-2.5">
                    <div className="w-24">
                      <label className="mb-1 block text-[11px] text-gray-500">期數</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={count}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                          setCount(Math.max(2, Math.min(12, n || 3)));
                        }}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[11px] text-gray-500">起始月份</label>
                      <select
                        value={startOffset}
                        onChange={(e) => setStartOffset(Number(e.target.value))}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        {[0, 1, 2, 3].map((off) => {
                          const d = addMonths(year, month, off);
                          return (
                            <option key={off} value={off}>
                              {ym(d.year, d.month)}
                              {off === 0 ? "（本月）" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {amount > 0 ? (
                    <>
                      <div className="flex flex-col gap-1 rounded-md border border-gray-200 bg-white p-2">
                        {preview.map((p, i) => {
                          const isCurrentMonth = p.year === year && p.month === month;
                          return (
                            <div key={p.index} className="flex justify-between text-[11.5px]">
                              <span className={i === 0 ? "font-bold text-blue-700" : "text-gray-600"}>
                                第 {p.index}/{p.total} 期 · {ym(p.year, p.month)}
                                {isCurrentMonth ? "（本月建立）" : "（排定）"}
                              </span>
                              <span className="font-mono font-semibold">${p.amount.toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        {startOffset === 0 ? "將建立 1 筆本月扣款" : "本月不扣款，將排定"} + 未來共 {count - 1}{" "}
                        筆扣款，總額 ${amount.toLocaleString()}（不整除時最後一期自動補齊差額）
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-gray-400">輸入金額後即可預覽各期拆分結果</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? "處理中..." : installmentOn ? "新增所有分期" : "新增扣款"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
