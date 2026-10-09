// 以手機（瀏覽器）本地時間為準的日期工具。員工都在台灣，本地時間就是台灣時間；
// 不可用 toISOString() 取今天，那是國際時間，台灣早上 8 點前會變成前一天
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// 本地日期 YYYY-MM-DD
export function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 今天（本地日期 YYYY-MM-DD）
export function localToday(): string {
  return toLocalDateKey(new Date());
}
