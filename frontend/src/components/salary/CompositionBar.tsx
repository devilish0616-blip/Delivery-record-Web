import { COMPOSITION_KEYS, COMPOSITION_META, type CompositionKey } from "../../constants/salaryComposition";

// 薪資組成堆疊條：依 COMPOSITION_META 的固定顏色，依比例畫出各分類佔比。
// height 較小時（表格內迷你版）僅顯示色塊、靠 title 顯示明細；height 較大時（明細面板）可再搭配 CompositionLegend。
export function CompositionBar({
  composition,
  height = 22,
}: {
  composition: Partial<Record<CompositionKey, number>>;
  height?: number;
}) {
  const total = COMPOSITION_KEYS.reduce((sum, k) => sum + (composition[k] ?? 0), 0) || 1;
  return (
    <div className="flex overflow-hidden rounded-md bg-gray-100" style={{ height }}>
      {COMPOSITION_KEYS.filter((k) => (composition[k] ?? 0) > 0).map((k) => {
        const value = composition[k] ?? 0;
        const pct = (value / total) * 100;
        return (
          <span
            key={k}
            title={`${COMPOSITION_META[k].label} $${Math.round(value).toLocaleString()}`}
            style={{ width: `${pct}%`, background: COMPOSITION_META[k].color, height: "100%" }}
          />
        );
      })}
    </div>
  );
}

export function CompositionLegendRows({ composition }: { composition: Partial<Record<CompositionKey, number>> }) {
  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      {COMPOSITION_KEYS.filter((k) => (composition[k] ?? 0) > 0).map((k) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ background: COMPOSITION_META[k].color }} />
          <span className="flex-1 text-gray-600">{COMPOSITION_META[k].label}</span>
          <span className="font-mono font-semibold text-gray-700">
            ${Math.round(composition[k] ?? 0).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
