// 從「系統設定 → 資料備份」下載的 JSON 還原資料（災難復原用）。
// 只能還原到「已跑過 migration、但還沒有資料」的資料庫，避免蓋掉現有資料：
//   1. 建一個新的空資料庫，把 DATABASE_URL 指向它
//   2. npx prisma migrate deploy
//   3. npx tsx scripts/restoreBackup.ts 備份檔.json
// 備份不含密碼：還原後所有帳號會設成隨機密碼，請用保底開發者帳號（npm run seed）登入後幫大家重設。

import fs from "fs";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { BACKUP_FORMAT, delegateOf, modelsInDependencyOrder, type BackupFile } from "../src/services/backupService";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("用法：npx tsx scripts/restoreBackup.ts 備份檔.json");
  const backup = JSON.parse(fs.readFileSync(file, "utf-8")) as BackupFile;
  if (backup.format !== BACKUP_FORMAT) throw new Error(`不是這個系統的備份檔（format=${backup.format}）`);

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) throw new Error("目標資料庫已經有資料，為避免蓋掉，只能還原到空的資料庫");

  const placeholderHash = await bcrypt.hash(randomUUID(), 10);
  let total = 0;
  for (const model of modelsInDependencyOrder()) {
    const rows = backup.tables[model] ?? [];
    if (rows.length === 0) continue;
    const data = model === "User" ? rows.map((r) => ({ ...r, passwordHash: placeholderHash })) : rows;
    // 一次 500 筆分批寫入
    for (let i = 0; i < data.length; i += 500) {
      const { count } = await delegateOf(model).createMany({ data: data.slice(i, i + 500), skipDuplicates: true });
      total += count;
    }
    console.log(`  ${model}：${rows.length} 筆`);
  }
  console.log(`還原完成，共 ${total} 筆（備份時間 ${backup.exportedAt}）。所有帳號的密碼都要重設。`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
