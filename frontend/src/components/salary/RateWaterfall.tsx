import { Check } from "lucide-react";
import type { PieceRateBreakdownStep } from "../../api/types";

// 「單價建構過程」階梯圖：逐步顯示固定原始單價 + 各項門檻加給是否達標，
// 取代過去只用一段 formulaNotes 純文字描述單價怎麼算出來的做法。
// 供薪資計算頁的員工明細面板、職等薪資設定頁的試算模擬器共用。
export function RateWaterfall({ steps, rate }: { steps: PieceRateBreakdownStep[]; rate: number }) {
  return (
    <div>
      <div className="flex flex-col">
        {steps.map((s) => (
          <div
            key={s.key}
            className="flex items-center gap-2.5 border-b border-dashed border-gray-200 py-1.5 last:border-b-0"
          >
            <span
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                s.hit ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
              }`}
            >
              {s.hit ? <Check className="h-3 w-3" /> : "—"}
            </span>
            <span className="flex-1 text-xs text-gray-600">
              {s.label}
              {s.condition && <span className="ml-1 block text-[11px] text-gray-400">{s.condition}</span>}
            </span>
            <span className={`min-w-[52px] text-right font-mono text-sm font-bold ${s.hit ? "text-green-600" : "text-gray-400"}`}>
              {s.key === "base" ? `$${s.amount.toFixed(1)}/件` : `${s.hit ? "+" : "+0.0"}${s.hit ? s.amount.toFixed(1) : ""} 元`}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-md bg-blue-50 px-3 py-2">
        <span className="text-xs font-bold text-blue-800">當月適用單價</span>
        <span className="font-mono text-base font-bold text-blue-800">${rate.toFixed(1)} / 件</span>
      </div>
    </div>
  );
}
