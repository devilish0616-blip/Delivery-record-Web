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

// 台灣時間（UTC+8，台灣不實施日光節約）。伺服器在 Railway 以 UTC 執行，
// 「今天」「這個月」一律用以下函式換算，避免台灣早上 8 點前被算成前一天、每月 1 日清晨被算成上個月
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

// 台灣日期字串 YYYY-MM-DD
export function taipeiDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

// 台灣的今天（存成當天 00:00 UTC，與 parseDateOnly 的資料庫日期格式一致）
export function taipeiToday(now: Date = new Date()): Date {
  return parseDateOnly(taipeiDateString(now));
}

// 台灣時間的年、月（1-12）、日
export function taipeiParts(now: Date = new Date()): { year: number; month: number; day: number } {
  const [year, month, day] = taipeiDateString(now).split("-").map(Number);
  return { year, month, day };
}

// 台灣時間 YYYY-MM-DD HH:mm（報表產出時間用）
export function taipeiDateTimeString(now: Date = new Date()): string {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}
