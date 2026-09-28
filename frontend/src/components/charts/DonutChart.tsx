import { useState } from "react";

// 泛用甜甜圈圖，畫法沿用 FinanceReportPage.tsx 既有的 inline SVG + hover 高亮寫法，
// 抽成獨立元件供「薪資計算」整體組成圖等其他頁面共用。
export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  const a = ((angle - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function slicePath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  if (a1 - a0 >= 359.999) a1 = a0 + 359.999;
  const [x0o, y0o] = polar(cx, cy, rOuter, a0);
  const [x1o, y1o] = polar(cx, cy, rOuter, a1);
  const [x1i, y1i] = polar(cx, cy, rInner, a1);
  const [x0i, y0i] = polar(cx, cy, rInner, a0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${big} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${big} 0 ${x0i} ${y0i} Z`;
}

export function DonutChart({
  slices,
  size = 168,
  centerLabel,
  formatValue = (v) => v.toLocaleString(),
}: {
  slices: DonutSlice[];
  size?: number;
  centerLabel: string;
  formatValue?: (value: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2;
  const rInner = r * 0.6;
  const arcs = slices.reduce<{ key: string; label: string; value: number; color: string; a0: number; a1: number; i: number }[]>(
    (acc, s, i) => {
      const a0 = acc.length > 0 ? acc[acc.length - 1].a1 : 0;
      const a1 = a0 + (s.value / total) * 360;
      acc.push({ ...s, a0, a1, i });
      return acc;
    },
    []
  );

  const activeSlice = hoverIdx !== null ? slices[hoverIdx] : null;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((s) => (
          <path
            key={s.key}
            d={slicePath(r, r, r - 1, rInner, s.a0, s.a1)}
            fill={s.color}
            stroke="#fff"
            strokeWidth={2}
            style={{
              cursor: "pointer",
              opacity: hoverIdx === null || hoverIdx === s.i ? 1 : 0.35,
              transition: "opacity .12s",
            }}
            onMouseEnter={() => setHoverIdx(s.i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute text-center">
        <div className="text-[10.5px] text-gray-400">{activeSlice ? activeSlice.label : centerLabel}</div>
        <div className="font-mono text-[17px] font-bold text-gray-700">
          {formatValue(activeSlice ? activeSlice.value : total)}
        </div>
      </div>
    </div>
  );
}

export function DonutLegend({
  slices,
  formatValue = (v) => v.toLocaleString(),
}: {
  slices: DonutSlice[];
  formatValue?: (value: number) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {slices.map((s) => (
        <div key={s.key} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: s.color }} />
          <span className="flex-1 text-gray-600">{s.label}</span>
          <span className="font-mono font-semibold text-gray-700">{formatValue(s.value)}</span>
        </div>
      ))}
    </div>
  );
}
