import { DEDUCTION_CATEGORIES, OTHER_DEDUCTION_CATEGORY, type DeductionCategory } from "../constants/deductionCategories";

// 後端 SalaryDeduction 只有 amount / reason 兩個欄位，沒有分類與分期欄位。
// 為了不改資料庫 schema，分類與分期資訊改用「編碼進 reason 文字」的方式儲存：
//   [分類名稱] 原因文字（分期 第i/共N期）
// 讀取時再用下面兩個函式解析回結構化資料；解析失敗（例如舊資料、或使用者手動改壞格式）一律安全退回「其他」分類、視為非分期。

const CATEGORY_PREFIX_RE = /^\[(.+?)\]\s*/;
const INSTALLMENT_SUFFIX_RE = /（分期\s*第?\s*(\d+)\s*\/\s*(\d+)\s*期）\s*$/;

export interface ParsedDeductionReason {
  category: DeductionCategory;
  text: string; // 已去除分類前綴與分期後綴的純原因文字
  installment: { index: number; total: number } | null;
}

export function parseDeductionReason(reason: string): ParsedDeductionReason {
  let text = reason;

  let installment: { index: number; total: number } | null = null;
  const suffixMatch = text.match(INSTALLMENT_SUFFIX_RE);
  if (suffixMatch) {
    installment = { index: Number(suffixMatch[1]), total: Number(suffixMatch[2]) };
    text = text.slice(0, suffixMatch.index).trimEnd();
  }

  let category = OTHER_DEDUCTION_CATEGORY;
  const prefixMatch = text.match(CATEGORY_PREFIX_RE);
  if (prefixMatch) {
    const matched = DEDUCTION_CATEGORIES.find((c) => c.label === prefixMatch[1]);
    if (matched) {
      category = matched;
      text = text.slice(prefixMatch[0].length);
    }
  }

  return { category, text, installment };
}

// 組出要送給後端的 reason 字串：分類前綴（其他分類不加前綴，保持乾淨）+ 原因文字 + 分期後綴（僅分期時附加）
export function formatDeductionReason(
  categoryKey: string,
  text: string,
  installment?: { index: number; total: number }
): string {
  const category = DEDUCTION_CATEGORIES.find((c) => c.key === categoryKey) ?? OTHER_DEDUCTION_CATEGORY;
  const prefix = category.key === "other" ? "" : `[${category.label}] `;
  const suffix = installment ? `（分期 第${installment.index}/${installment.total}期）` : "";
  return `${prefix}${text}${suffix}`.trim();
}
