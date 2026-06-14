import ExcelJS from "exceljs";

export interface ParsedSupplierSummary {
  forwardCount: number; // 正物流總合計件數
  reverseCount: number; // 逆物流總合計件數
  revenueBeforeTax: number; // 運費收入(淨額)總計，未稅
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "result" in (value as object)) {
    return String((value as { result?: unknown }).result ?? "").trim();
  }
  return String(value).trim();
}

function cellNumber(cell: ExcelJS.Cell): number {
  const value = cell.value;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "result" in value) {
    const result = (value as { result?: unknown }).result;
    return typeof result === "number" ? result : NaN;
  }
  const parsed = Number(String(value ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

// 取得該列中文字「完全等於」label 的儲存格，其前一個有值儲存格的數值
function numberBeforeExactLabel(row: ExcelJS.Row, label: string): number | null {
  let result: number | null = null;
  let prevValue: number | null = null;
  row.eachCell((cell) => {
    const text = cellText(cell);
    if (text === label && prevValue !== null) {
      result = prevValue;
    }
    const num = cellNumber(cell);
    prevValue = Number.isFinite(num) ? num : null;
  });
  return result;
}

// 取得該列中文字「包含」label 的儲存格，其後一個有值儲存格的數值
function numberAfterLabel(row: ExcelJS.Row, label: string): number | null {
  let result: number | null = null;
  let labelSeen = false;
  row.eachCell((cell) => {
    const text = cellText(cell);
    if (labelSeen && result === null) {
      const num = cellNumber(cell);
      if (Number.isFinite(num)) result = num;
      labelSeen = false;
    }
    if (text.includes(label)) {
      labelSeen = true;
    }
  });
  return result;
}

// 解析貨運行月結 Excel 第一個工作表（總表）：以關鍵字定位（非固定座標），找出：
// - 正物流總合計件數：該列同時包含「正物流」與「總合計」，數值在「件」前一格
// - 逆物流總合計件數：該列同時包含「逆物流」與「總合計」，數值在「件」前一格
// - 運費收入(淨額)總計（未稅）：該列包含「運費收入」「淨額」「總計」，數值在「未稅」後一格
export async function parseSupplierSummarySheet(buffer: Buffer): Promise<ParsedSupplierSummary> {
  const workbook = new ExcelJS.Workbook();
  // exceljs 型別定義與較新版 @types/node 的 Buffer 泛型存在已知不相容問題，故以 any 轉型呼叫
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("Excel 檔案中找不到工作表");
  }

  let forwardCount: number | null = null;
  let reverseCount: number | null = null;
  let revenueBeforeTax: number | null = null;

  sheet.eachRow((row) => {
    const texts: string[] = [];
    row.eachCell((cell) => texts.push(cellText(cell)));
    const hasExact = (kw: string) => texts.includes(kw);
    const hasIncludes = (kw: string) => texts.some((t) => t.includes(kw));

    if (hasExact("總合計")) {
      if (forwardCount === null && hasExact("正物流")) {
        forwardCount = numberBeforeExactLabel(row, "件");
      }
      if (reverseCount === null && hasExact("逆物流")) {
        reverseCount = numberBeforeExactLabel(row, "件");
      }
    }

    if (
      revenueBeforeTax === null &&
      hasIncludes("運費收入") &&
      hasIncludes("淨額") &&
      hasIncludes("總計")
    ) {
      revenueBeforeTax = numberAfterLabel(row, "未稅");
    }
  });

  if (forwardCount === null || reverseCount === null || revenueBeforeTax === null) {
    const missing = [
      forwardCount === null ? "正物流總合計件數" : null,
      reverseCount === null ? "逆物流總合計件數" : null,
      revenueBeforeTax === null ? "運費收入(淨額)總計（未稅）" : null,
    ].filter((m): m is string => m !== null);
    throw new Error(`無法從 Excel 第一個工作表中找到：${missing.join("、")}，請確認檔案格式`);
  }

  return { forwardCount, reverseCount, revenueBeforeTax };
}
