import type { EmployeeMonthlySalary } from "./salaryService";

export interface SalaryGoalHint {
  title: string;
  detail: string;
}

type SalaryProgress = Pick<
  EmployeeMonthlySalary,
  "rateBreakdown" | "incentiveTiers" | "attendanceDays" | "averageDailyCount" | "totalDeliveryCount"
>;

// 首頁「我的待辦」用：本月還沒達到、月底前來得及、而且差不多快到的加給門檻，挑最接近的一項。
// remainingDays＝本月還能出勤的天數（含今天，若今天還沒填送件）。差太多的不提醒，避免月初每個人都被洗版。
export function nearestSalaryGoal(s: SalaryProgress, remainingDays: number): SalaryGoalHint | null {
  const candidates: { score: number; hint: SalaryGoalHint }[] = [];

  for (const step of s.rateBreakdown ?? []) {
    if (step.hit || step.current === undefined || step.target === undefined) continue;
    if (step.metric === "days") {
      const gap = step.target - step.current;
      if (gap > 0 && gap <= 5 && gap <= remainingDays) {
        candidates.push({
          score: gap,
          hint: {
            title: `再出勤 ${gap} 天，每件單價 +$${step.amount}`,
            detail: `${step.label}：出勤滿 ${step.target} 天（目前 ${step.current} 天）`,
          },
        });
      }
    } else if (step.metric === "total") {
      const gap = step.target - step.current;
      const pace = s.averageDailyCount;
      // 照目前日均送下去月底前送得到，且只差一成以內
      if (gap > 0 && pace > 0 && gap <= pace * remainingDays && gap <= step.target * 0.1) {
        candidates.push({
          score: gap / pace,
          hint: {
            title: `本月再送 ${gap} 件，每件單價 +$${step.amount}`,
            detail: `${step.label}：總件數滿 ${step.target} 件（目前 ${step.current} 件）`,
          },
        });
      }
    }
  }

  // 激勵獎金：日均已經達標、只差出勤天數時提醒（兩階擇高，已拿到高階就不提醒）
  const tiers = s.incentiveTiers ?? [];
  if (!tiers[0]?.hit) {
    const tier = tiers.find((t) => !t.hit && s.averageDailyCount > t.avg);
    if (tier) {
      const gap = tier.days - s.attendanceDays;
      if (gap > 0 && gap <= 5 && gap <= remainingDays) {
        candidates.push({
          score: gap - 0.5, // 同樣差幾天時，先提醒獎金（金額較大）
          hint: {
            title: `再出勤 ${gap} 天，可拿激勵獎金 $${tier.amount.toLocaleString("en-US")}`,
            detail: `出勤滿 ${tier.days} 天且日均超過 ${tier.avg} 件（目前 ${s.attendanceDays} 天、日均 ${s.averageDailyCount.toFixed(1)} 件）`,
          },
        });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.hint ?? null;
}

// 本月還能出勤幾天：今天到月底（今天已填送件就不算今天）
export function remainingWorkDays(year: number, month: number, todayDate: number, todayFilled: boolean): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.max(0, daysInMonth - todayDate + (todayFilled ? 0 : 1));
}
