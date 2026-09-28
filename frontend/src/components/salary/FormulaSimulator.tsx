import { useState } from "react";
import type { SalaryFormulaConfig } from "../../api/types";
import { buildPieceRateBreakdown, pieceRateFromBreakdown, resolveIncentiveBonus } from "../../utils/salaryFormulaPreview";
import { RateWaterfall } from "./RateWaterfall";

// 職等薪資設定頁的「試算模擬器」：輸入假設的出勤天數／總件數，即時看到單價建構過程與薪資結果，
// 並用一條「單價 vs 出勤天數」曲線圖標出各出勤門檻造成的「懸崖」在哪裡，
// 取代過去只能盯著一排數字表單、自己心算公式效果的做法。
export function FormulaSimulator({ config }: { config: SalaryFormulaConfig }) {
  const [days, setDays] = useState(22);
  const [total, setTotal] = useState(1200);

  const avg = days > 0 ? total / days : 0;
  const steps = buildPieceRateBreakdown(days, avg, total, config);
  const rate = pieceRateFromBreakdown(steps);
  const incentive = resolveIncentiveBonus(days, avg, config);
  const pieceWork = rate * total;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">試算模擬器</h3>
        <p className="mt-0.5 text-xs text-gray-400">調整假設的出勤天數與總件數，即時看出單價與薪資變化</p>
      </div>

      <SliderField label="假設出勤天數" unit="天" value={days} min={1} max={31} onChange={setDays} />
      <SliderField label="假設當月總件數" unit="件" value={total} min={0} max={2200} step={20} onChange={setTotal} />

      <div className="border-t border-gray-100 pt-3">
        <RateWaterfall steps={steps} rate={rate} />
      </div>

      <div className="flex flex-col gap-1 border-t border-gray-100 pt-3 text-xs">
        <Line label="日均件數" value={`${avg.toFixed(1)} 件`} />
        <Line label="按件薪資" value={`$${Math.round(pieceWork).toLocaleString()}`} />
        <Line label={`激勵獎金（第 ${incentive.tier || "-"} 級）`} value={`$${incentive.amount.toLocaleString()}`} />
        <div className="mt-1 flex justify-between border-t border-dashed border-gray-200 pt-2 text-sm font-bold text-blue-700">
          <span>試算薪資（不含加給／補貼）</span>
          <span className="font-mono">${Math.round(pieceWork + incentive.amount).toLocaleString()}</span>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
          單價 vs. 出勤天數（總件數固定為 {total} 件）
        </p>
        <RateCurveChart config={config} total={total} activeDays={days} />
      </div>
    </div>
  );
}

function SliderField({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs font-medium text-gray-600">
        <span>{label}</span>
        <span className="font-mono text-blue-700">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-blue-600"
      />
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono font-semibold text-gray-700">{value}</span>
    </div>
  );
}

// 簡易 SVG 折線圖：X 軸出勤天數 1-31（總件數固定），Y 軸單價，並用虛線標出三個出勤門檻位置
function RateCurveChart({
  config,
  total,
  activeDays,
}: {
  config: SalaryFormulaConfig;
  total: number;
  activeDays: number;
}) {
  const w = 320;
  const h = 150;
  const padL = 38;
  const padR = 8;
  const padT = 12;
  const padB = 22;

  const points = Array.from({ length: 31 }, (_, i) => {
    const d = i + 1;
    const avg = total / d;
    const steps = buildPieceRateBreakdown(d, avg, total, config);
    return { d, rate: pieceRateFromBreakdown(steps) };
  });
  const minY = Math.min(...points.map((p) => p.rate)) - 0.5;
  const maxY = Math.max(...points.map((p) => p.rate)) + 0.5;
  const x = (d: number) => padL + ((d - 1) / 30) * (w - padL - padR);
  const y = (v: number) => h - padB - ((v - minY) / (maxY - minY)) * (h - padT - padB);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.d).toFixed(1)} ${y(p.rate).toFixed(1)}`).join(" ");

  const thresholds = [
    config.pieceRate.attendanceBonus.tier1Days,
    config.pieceRate.attendanceBonus.tier2Days,
    config.pieceRate.attendanceBonus.tier3Days,
  ];
  const curDay = Math.min(31, Math.max(1, activeDays));
  const curAvg = total / curDay;
  const curRate = pieceRateFromBreakdown(buildPieceRateBreakdown(curDay, curAvg, total, config));

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      {[minY, (minY + maxY) / 2, maxY].map((v, i) => (
        <g key={i}>
          <text x={2} y={y(v) + 3} fontSize={9} fill="#9ca3af">
            {v.toFixed(1)}
          </text>
          <line x1={padL} y1={y(v)} x2={w - padR} y2={y(v)} stroke="#e5e7eb" strokeWidth={1} />
        </g>
      ))}
      {thresholds.map((t, i) => (
        <g key={i}>
          <line x1={x(t)} y1={padT} x2={x(t)} y2={h - padB} stroke="#d1d5db" strokeDasharray="3,3" strokeWidth={1} />
          <text x={x(t)} y={padT - 2} fontSize={9} fill="#9ca3af" textAnchor="middle">
            第{i + 1}階
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(curDay)} cy={y(curRate)} r={4.5} fill="#2563eb" stroke="#fff" strokeWidth={2} />
      <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#d1d5db" strokeWidth={1} />
      <text x={padL} y={h - 6} fontSize={9} fill="#9ca3af">
        1天
      </text>
      <text x={w - padR} y={h - 6} fontSize={9} fill="#9ca3af" textAnchor="end">
        31天
      </text>
    </svg>
  );
}
