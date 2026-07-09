// 驗收用：核對 2026/06 月報數字與舊系統 月報表_2026_06.pdf 是否完全一致
import { getMonthlyFinanceReport } from "../src/services/financeReportService";
import { prisma } from "../src/lib/prisma";

async function main() {
  const r = await getMonthlyFinanceReport(2026, 6);
  console.log("收入合計", r.summary.incomeTotal, "（預期 589000）");
  console.log("支出合計", r.summary.expenseTotal, "（預期 581854）");
  console.log("淨損益", r.summary.net, "（預期 7146）");
  console.log("--- 支出分類 ---");
  for (const c of r.expenseByCategory)
    console.log(c.categoryName, c.amount, c.percent.toFixed(1) + "%", c.count);
  console.log("--- 收入分類 ---");
  for (const c of r.incomeByCategory)
    console.log(c.categoryName, c.amount, c.percent.toFixed(1) + "%", c.count);
  console.log("--- 股東結算（預期 48138/48000/138、318237/332000/-13763、0/0/0）---");
  for (const s of r.settlement) console.log(s.partyName, s.advanced, s.received, s.balance);
  console.log("--- 累計結算（開帳以來）---");
  for (const s of r.cumulativeSettlement) console.log(s.partyName, s.advanced, s.received, s.balance);
  console.log("明細筆數（撥款已合併單筆）", r.records.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
