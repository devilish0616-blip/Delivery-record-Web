import type { EmployeeMonthlySalary, PieceRateBreakdownStep } from "../../api/types";

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

interface GoalRow {
  key: string;
  label: string;
  progress: number; // 0..1
  value: string; // 目前／門檻
  hit: boolean;
  message: string;
  tone: "good" | "todo" | "late";
}

// 我的薪資「下一階加給」：本月每個門檻目前到哪裡、還差多少、月底前來不來得及。
// 只在「本月、尚未封存」時顯示；數字全部來自薪資試算本身，不另外計算薪資。
export function SalaryGoals({ salary: s }: { salary: EmployeeMonthlySalary & { locked?: boolean } }) {
  const now = new Date();
  const isCurrentMonth = s.year === now.getFullYear() && s.month === now.getMonth() + 1;
  const steps = (s.rateBreakdown ?? []).filter(
    (st): st is PieceRateBreakdownStep & { current: number; target: number } =>
      st.metric !== undefined && st.current !== undefined && st.target !== undefined
  );
  if (s.locked || !isCurrentMonth || steps.length === 0) return null;

  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const todayFilled = s.dailyDetails.some((d) => d.date === todayKey);
  const daysInMonth = new Date(s.year, s.month, 0).getDate();
  const remaining = Math.max(0, daysInMonth - now.getDate() + (todayFilled ? 0 : 1));
  const total = s.totalDeliveryCount;
  const extra = (perPiece: number) => (total > 0 ? `，以目前 ${total.toLocaleString()} 件算約多 ${money(perPiece * total)}` : "");

  const rows: GoalRow[] = steps.map((st) => {
    const perPiece = `每件 +$${st.amount}`;
    if (st.metric === "days") {
      const gap = st.target - st.current;
      return {
        key: st.key,
        label: `出勤滿 ${st.target} 天`,
        progress: Math.min(1, st.current / st.target),
        value: `${st.current} / ${st.target} 天`,
        hit: st.hit,
        message: st.hit
          ? `已達成，${perPiece}`
          : gap <= remaining
            ? `再出勤 ${gap} 天，${perPiece}${extra(st.amount)}`
            : `本月只剩 ${remaining} 天，這階來不及了`,
        tone: st.hit ? "good" : gap <= remaining ? "todo" : "late",
      };
    }
    if (st.metric === "avg") {
      return {
        key: st.key,
        label: `日均超過 ${st.target} 件`,
        progress: Math.min(1, st.current / st.target),
        value: `${st.current.toFixed(1)} / ${st.target} 件`,
        hit: st.hit,
        message: st.hit
          ? `已達成，${perPiece}`
          : `日均拉到超過 ${st.target} 件，${perPiece}${extra(st.amount)}`,
        tone: st.hit ? "good" : "todo",
      };
    }
    // 總件數：照目前日均送到月底能不能達到
    const gap = st.target - st.current;
    const projected = st.current + s.averageDailyCount * remaining;
    return {
      key: st.key,
      label: `總件數滿 ${st.target.toLocaleString()} 件`,
      progress: Math.min(1, st.current / st.target),
      value: `${st.current.toLocaleString()} / ${st.target.toLocaleString()} 件`,
      hit: st.hit,
      message: st.hit
        ? `已達成，${perPiece}`
        : `再送 ${gap.toLocaleString()} 件，${perPiece}${projected >= st.target ? "；照目前速度月底前可以達到" : "；照目前速度月底前不太夠"}`,
      tone: st.hit ? "good" : projected >= st.target ? "todo" : "late",
    };
  });

  // 激勵獎金（兩階擇高）：已拿到高階就只顯示已達成；否則顯示每一階還差什麼
  const tiers = s.incentiveTiers ?? [];
  const topHit = tiers.findIndex((t) => t.hit);
  tiers.forEach((t, i) => {
    if (topHit !== -1 && i > topHit) return;
    const dayGap = Math.max(0, t.days - s.attendanceDays);
    const avgOk = s.averageDailyCount > t.avg;
    const needs = [
      dayGap > 0 && `再出勤 ${dayGap} 天`,
      !avgOk && `日均要超過 ${t.avg} 件（目前 ${s.averageDailyCount.toFixed(1)}）`,
    ].filter(Boolean);
    rows.push({
      key: `incentive-${i}`,
      label: `激勵獎金 ${money(t.amount)}`,
      progress: Math.min(1, s.attendanceDays / t.days, s.averageDailyCount / t.avg),
      value: `出勤 ${t.days} 天＋日均 ${t.avg} 件`,
      hit: t.hit,
      message: t.hit ? "已達成" : dayGap > remaining ? `本月只剩 ${remaining} 天，出勤天數來不及了` : `${needs.join("，")}`,
      tone: t.hit ? "good" : dayGap > remaining ? "late" : "todo",
    });
  });

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">下一階加給還差多少</h2>
        <span className="text-xs text-gray-500">本月還剩 {remaining} 天</span>
      </div>
      <ul className="divide-y divide-gray-50">
        {rows.map((r) => (
          <li key={r.key} className="space-y-1.5 px-4 py-3">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className={r.hit ? "text-gray-500" : "font-medium text-gray-800"}>{r.label}</span>
              <span className="font-mono text-xs text-gray-500">{r.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${r.hit ? "bg-green-500" : r.tone === "late" ? "bg-gray-300" : "bg-blue-500"}`}
                style={{ width: `${Math.round(r.progress * 100)}%` }}
              />
            </div>
            <p
              className={`text-xs ${
                r.tone === "good" ? "text-green-700" : r.tone === "late" ? "text-gray-400" : "text-amber-700"
              }`}
            >
              {r.hit ? "✓ " : ""}
              {r.message}
            </p>
          </li>
        ))}
      </ul>
      <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
        依目前填的件數試算，月底結算前會跟著變動。
      </p>
    </section>
  );
}
