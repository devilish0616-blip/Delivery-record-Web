import { ChevronLeft, ChevronRight } from "lucide-react";

// 共用年月切換元件，取代薪資計算／我的薪資等頁面各自重複的原生年月 <select> 組合。
export function YearMonthPicker({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}) {
  function shift(delta: number) {
    let y = year;
    let m = month + delta;
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    onChange(y, m);
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-gray-300 bg-white p-0.5 shadow-sm">
      <button
        type="button"
        onClick={() => shift(-1)}
        className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
        aria-label="上個月"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select
        value={year}
        onChange={(e) => onChange(Number(e.target.value), month)}
        className="rounded border-none bg-transparent px-1 py-1 text-sm font-medium focus:outline-none"
      >
        {[year - 1, year, year + 1].map((y) => (
          <option key={y} value={y}>
            {y} 年
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className="rounded border-none bg-transparent px-1 py-1 text-sm font-medium focus:outline-none"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m} 月
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => shift(1)}
        className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
        aria-label="下個月"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
