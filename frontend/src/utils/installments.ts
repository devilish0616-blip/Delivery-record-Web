export function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + offset;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export interface InstallmentPeriod {
  index: number;
  total: number;
  year: number;
  month: number;
  amount: number;
}

// 將總金額拆成 count 期，每期金額為整數，無法整除時把差額補在最後一期，確保加總與原總金額一致
export function computeInstallments(
  totalAmount: number,
  count: number,
  startYear: number,
  startMonth: number
): InstallmentPeriod[] {
  const base = Math.floor(totalAmount / count);
  const remainder = totalAmount - base * count;
  const periods: InstallmentPeriod[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < count; i++) {
    periods.push({ index: i + 1, total: count, year: y, month: m, amount: base + (i === count - 1 ? remainder : 0) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return periods;
}
