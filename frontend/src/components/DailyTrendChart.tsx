import { useState } from "react";
import type { DashboardData } from "../api/types";

export const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export function formatDateLabel(dateStr: string): { label: string; weekday: number } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return { label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, weekday: d.getUTCDay() };
}

export function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

// 簡易 SVG 折線圖：X 軸為當月每一天，Y 軸依有無設定單價顯示毛利或總件數，
// 滑鼠移動時顯示十字線與數值 tooltip
export function DailyTrendChart({
  items,
  useProfit,
}: {
  items: DashboardData["dailyBreakdown"];
  useProfit: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const w = 900;
  const h = 190;
  const padL = 46;
  const padR = 10;
  const padT = 14;
  const padB = 24;

  const values = items.map((d) => (useProfit ? (d.profit ?? 0) : d.totalCount));
  const minY = Math.min(0, ...values);
  const maxY = Math.max(...values, 1);
  const x = (i: number) => padL + (items.length > 1 ? (i / (items.length - 1)) * (w - padL - padR) : 0);
  const y = (v: number) => h - padB - ((v - minY) / (maxY - minY || 1)) * (h - padT - padB);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const hovered = hoverIdx !== null ? items[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const idx = Math.round(ratio * (items.length - 1) * (w / (w - padL - padR)) - (padL / (w - padL - padR)) * (items.length - 1));
          const clamped = Math.max(0, Math.min(items.length - 1, idx));
          setHoverIdx(clamped);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[minY, (minY + maxY) / 2, maxY].map((v, i) => (
          <g key={i}>
            <text x={2} y={y(v) + 3} fontSize={9} fill="#9ca3af">
              {Math.round(v).toLocaleString()}
            </text>
            <line x1={padL} y1={y(v)} x2={w - padR} y2={y(v)} stroke="#e5e7eb" strokeWidth={1} />
          </g>
        ))}
        {useProfit && <line x1={padL} y1={zeroY} x2={w - padR} y2={zeroY} stroke="#c3c9d6" strokeWidth={1.2} />}
        <path d={path} fill="none" stroke="#2851aa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {hoverIdx !== null && (
          <>
            <line x1={x(hoverIdx)} y1={padT} x2={x(hoverIdx)} y2={h - padB} stroke="#c3c9d6" strokeDasharray="3,3" strokeWidth={1} />
            <circle cx={x(hoverIdx)} cy={y(values[hoverIdx])} r={4.5} fill="#2851aa" stroke="#fff" strokeWidth={2} />
          </>
        )}
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#c3c9d6" strokeWidth={1} />
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute rounded-md bg-gray-800 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{
            left: `${(x(hoverIdx!) / w) * 100}%`,
            top: 0,
            transform: "translate(-50%, -100%)",
          }}
        >
          <p className="font-mono font-semibold">{formatDateLabel(hovered.date).label}</p>
          <p className="font-mono">
            {useProfit ? `毛利 ${formatCurrency(hovered.profit ?? 0)}` : `件數 ${hovered.totalCount}`}
          </p>
        </div>
      )}
    </div>
  );
}
