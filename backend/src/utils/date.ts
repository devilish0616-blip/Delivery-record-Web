// 將日期字串 (YYYY-MM-DD) 正規化為當天 00:00:00 UTC 的 Date，做為資料庫儲存與比對用
export function parseDateOnly(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`無效的日期格式: ${dateStr}`);
  }
  return date;
}

export function startOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

export function startOfNextMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
