import ExcelJS from "exceljs";

export interface ParsedExcelSummary {
  totalCount: number;
  totalAmount: number;
}

// 嘗試從欄位標題找出符合關鍵字的欄位索引
function findColumnIndex(headerRow: ExcelJS.Row, keywords: string[]): number | null {
  let found: number | null = null;
  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value ?? "").trim();
    if (keywords.some((k) => text.includes(k))) {
      found = colNumber;
    }
  });
  return found;
}

function cellNumber(cell: ExcelJS.Cell): number {
  const value = cell.value;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "result" in value) {
    const result = (value as { result?: unknown }).result;
    return typeof result === "number" ? result : 0;
  }
  const parsed = Number(String(value ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// 解析貨運行月結 Excel：讀取第一個工作表，依標題關鍵字找出「送件數量」與「金額」欄位並加總
// 貨運行 Excel 格式固定，若實際欄位名稱不同，可調整下方關鍵字清單
export async function parseSupplierExcel(buffer: Buffer): Promise<ParsedExcelSummary> {
  const workbook = new ExcelJS.Workbook();
  // exceljs 型別定義與較新版 @types/node 的 Buffer 泛型存在已知不相容問題，故以 any 轉型呼叫
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("Excel 檔案中找不到工作表");
  }

  const headerRow = sheet.getRow(1);
  const countColIndex = findColumnIndex(headerRow, ["數量", "件數", "票數"]);
  const amountColIndex = findColumnIndex(headerRow, ["金額", "應付", "費用"]);

  if (!countColIndex || !amountColIndex) {
    throw new Error("無法辨識 Excel 欄位，請確認包含「數量/件數」與「金額」欄位");
  }

  let totalCount = 0;
  let totalAmount = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // 跳過標題列
    totalCount += cellNumber(row.getCell(countColIndex));
    totalAmount += cellNumber(row.getCell(amountColIndex));
  });

  return { totalCount, totalAmount };
}
