// 舊單機記帳系統（finance.db, SQLite）一次性匯入
//
// 用法（於 backend 資料夾）：
//   npx tsx scripts/importFinanceDb.ts [--db <finance.db路徑>] [--dry-run]
//
// 行為：
//   - 內部撥款成對兩筆（撥給 X／收到 Y）自動合併成單筆 TRANSFER
//   - 不在分類清單的 purpose 自動補建分類
//   - 全部標記 sourceType=IMPORT；若資料庫已有 IMPORT 帳目則中止（避免重複匯入）

import { FinanceCategoryKind, FinanceRecordType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { parseDateOnly } from "../src/utils/date";
import { ensureFinanceDefaults, findOrCreateCategory } from "../src/services/financeService";

// node:sqlite 為 Node 22.13+ 內建模組，@types/node v20 尚無型別定義
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => {
    prepare(sql: string): { all(): OldRecord[] };
    close(): void;
  };
};

interface OldRecord {
  id: number;
  date: string; // YYYY-MM-DD
  record_type: string; // 支出／收入／內部撥款
  party: string;
  amount: number; // 支出與「撥給」為負數
  purpose: string;
  note: string;
  created_at: string;
}

const DEFAULT_DB_PATH = "G:/我的雲端硬碟/九日物流/紀錄/data/finance.db";

interface NewRecordInput {
  date: Date;
  type: FinanceRecordType;
  partyName: string;
  counterPartyName: string | null;
  categoryName: string | null; // TRANSFER 為 null
  categoryKind: FinanceCategoryKind | null;
  amount: number; // 正數
  note: string | null;
}

// 內部撥款成對合併：撥給列（負數）配對同日、同金額、同備註的收到列（正數）
export function mergeTransferPairs(rows: OldRecord[]): {
  merged: NewRecordInput[];
  errors: string[];
} {
  const gives = rows.filter((r) => r.amount < 0).sort((a, b) => a.id - b.id);
  const receives = rows.filter((r) => r.amount > 0).sort((a, b) => a.id - b.id);
  const consumed = new Set<number>();
  const merged: NewRecordInput[] = [];
  const errors: string[] = [];

  for (const give of gives) {
    const target = give.purpose.replace(/^撥給\s*/, "").trim(); // 轉入方
    const match = receives.find(
      (r) =>
        !consumed.has(r.id) &&
        r.date === give.date &&
        r.amount === -give.amount &&
        r.party === target &&
        r.purpose.replace(/^收到\s*/, "").trim() === give.party &&
        (r.note ?? "") === (give.note ?? "")
    );
    if (!match) {
      errors.push(`找不到配對的「收到」列：#${give.id} ${give.date} ${give.party} ${give.purpose} ${give.amount}`);
      continue;
    }
    consumed.add(match.id);
    merged.push({
      date: parseDateOnly(give.date),
      type: "TRANSFER",
      partyName: give.party,
      counterPartyName: target,
      categoryName: null,
      categoryKind: null,
      amount: -give.amount,
      note: give.note || null,
    });
  }

  for (const r of receives) {
    if (!consumed.has(r.id)) {
      errors.push(`「收到」列沒有對應的「撥給」列：#${r.id} ${r.date} ${r.party} ${r.purpose} ${r.amount}`);
    }
  }

  return { merged, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dbIdx = args.indexOf("--db");
  const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : DEFAULT_DB_PATH;

  console.log(`讀取舊資料庫：${dbPath}${dryRun ? "（dry-run，不寫入）" : ""}`);
  const sqlite = new DatabaseSync(dbPath, { readOnly: true });
  const rows = sqlite.prepare("SELECT * FROM records ORDER BY id").all();
  sqlite.close();
  console.log(`舊帳目共 ${rows.length} 筆`);

  // 防重複匯入
  const alreadyImported = await prisma.financeRecord.count({ where: { sourceType: "IMPORT" } });
  if (alreadyImported > 0) {
    console.error(
      `❌ 資料庫已有 ${alreadyImported} 筆匯入帳目（sourceType=IMPORT），中止。` +
        `若要重新匯入，請先刪除既有匯入資料。`
    );
    process.exit(1);
  }

  // 組裝待建帳目
  const inputs: NewRecordInput[] = [];

  const transfers = rows.filter((r) => r.record_type === "內部撥款");
  const { merged, errors } = mergeTransferPairs(transfers);
  if (errors.length > 0) {
    for (const e of errors) console.error(`❌ ${e}`);
    console.error("內部撥款配對失敗，中止匯入。");
    process.exit(1);
  }
  console.log(`內部撥款 ${transfers.length} 列 → 合併為 ${merged.length} 筆單筆撥款`);
  inputs.push(...merged);

  for (const r of rows) {
    if (r.record_type === "內部撥款") continue;
    const isIncome = r.record_type === "收入";
    if (!isIncome && r.record_type !== "支出") {
      console.error(`❌ 未知類別「${r.record_type}」（#${r.id}），中止。`);
      process.exit(1);
    }
    inputs.push({
      date: parseDateOnly(r.date),
      type: isIncome ? "INCOME" : "EXPENSE",
      partyName: r.party,
      counterPartyName: null,
      categoryName: r.purpose || "其他",
      categoryKind: isIncome ? "INCOME" : "EXPENSE",
      amount: Math.abs(r.amount),
      note: r.note || null,
    });
  }

  console.log(`預計建立帳目 ${inputs.length} 筆`);
  if (dryRun) {
    console.log("dry-run 結束，未寫入任何資料。");
    return;
  }

  // 建立預設資料＋補齊關係人與分類
  await ensureFinanceDefaults();

  const partyNames = new Set<string>();
  for (const i of inputs) {
    partyNames.add(i.partyName);
    if (i.counterPartyName) partyNames.add(i.counterPartyName);
  }
  const partyIds = new Map<string, string>();
  for (const name of partyNames) {
    let party = await prisma.financeParty.findUnique({ where: { name } });
    if (!party) {
      console.log(`補建關係人：${name}`);
      const maxOrder = await prisma.financeParty.aggregate({ _max: { sortOrder: true } });
      party = await prisma.financeParty.create({
        data: { name, isShareholder: false, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
      });
    }
    partyIds.set(name, party.id);
  }

  const categoryIds = new Map<string, string>(); // key: kind|name
  for (const i of inputs) {
    if (!i.categoryName || !i.categoryKind) continue;
    const key = `${i.categoryKind}|${i.categoryName}`;
    if (categoryIds.has(key)) continue;
    const category = await findOrCreateCategory(i.categoryKind, i.categoryName);
    categoryIds.set(key, category.id);
  }

  await prisma.financeRecord.createMany({
    data: inputs.map((i) => ({
      date: i.date,
      type: i.type,
      partyId: partyIds.get(i.partyName)!,
      counterPartyId: i.counterPartyName ? partyIds.get(i.counterPartyName)! : null,
      categoryId:
        i.categoryName && i.categoryKind
          ? categoryIds.get(`${i.categoryKind}|${i.categoryName}`)!
          : null,
      amount: i.amount,
      note: i.note,
      sourceType: "IMPORT" as const,
    })),
  });

  console.log(`✅ 匯入完成：${inputs.length} 筆帳目`);

  // 匯入後摘要（供人工核對）
  const total = await prisma.financeRecord.count();
  console.log(`資料庫目前帳目總數：${total}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
