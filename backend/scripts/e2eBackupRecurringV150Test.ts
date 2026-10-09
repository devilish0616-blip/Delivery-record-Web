// 資料備份與固定收支端對端實測（v1.50）：
// 下載全部資料（每張表都有、不含密碼、記下備份時間、只有董事長）→ 超過 7 天沒備份首頁提醒
// → 固定收支範本：到期判斷（過去月份、月底日期）、帶入、不能重複帶入、刪帳目後可再帶、這個月不用與取消、分類要對、權限、首頁提醒
// 用法：npx tsx scripts/e2eBackupRecurringV150Test.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料（備份時間還原成測試前的值）。

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api";
const EMAIL = "e2e-v150-finance@test.com";

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json: json as Record<string, unknown> };
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ""); }
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test1234" }),
  });
  return ((await res.json()) as { token: string }).token;
}

type Item = { id: string; name: string; state: string; recordId: string | null; dueDate: string };
const startedAt = new Date();
const templateIds: string[] = [];
let savedBackup: { lastBackupAt: Date | null; lastBackupById: string | null } | null = null;

async function cleanup() {
  if (templateIds.length) {
    const runs = await prisma.financeRecurringRun.findMany({ where: { recurringId: { in: templateIds } } });
    const recordIds = runs.map((r) => r.recordId).filter((x): x is string => !!x);
    await prisma.financeRecurring.deleteMany({ where: { id: { in: templateIds } } });
    if (recordIds.length) await prisma.financeRecord.deleteMany({ where: { id: { in: recordIds } } });
  }
  await prisma.financeRecord.deleteMany({ where: { note: { startsWith: "E2E固定" } } });
  if (savedBackup) await prisma.salarySettings.update({ where: { id: 1 }, data: savedBackup });
  const users = await prisma.user.findMany({ where: { email: EMAIL }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { createdAt: { gte: startedAt } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

async function main() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const settings = await prisma.salarySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  savedBackup = { lastBackupAt: settings.lastBackupAt, lastBackupById: settings.lastBackupById };
  const passwordHash = await bcrypt.hash("test1234", 10);
  await prisma.user.create({ data: { email: EMAIL, passwordHash, name: "E2E記帳員", role: "EMPLOYEE", extraCapabilities: ["MANAGE_FINANCE"] } });
  const admin = await login("local-admin@test.com");
  const financeUser = await login(EMAIL);

  console.log("下載全部資料");
  const res = await fetch(`${BASE}/backup/export`, { headers: { Authorization: `Bearer ${admin}` } });
  check("下載成功是 JSON 附件", res.status === 200 && (res.headers.get("content-disposition") ?? "").includes("attachment"));
  const backup = (await res.json()) as { format: string; tables: Record<string, Record<string, unknown>[]> };
  check("備份格式正確", backup.format === "xusi-backup-v1");
  const models = Prisma.dmmf.datamodel.models.map((m) => m.name);
  check(`每張資料表都有（${models.length} 張）`, models.every((m) => Array.isArray(backup.tables[m])), models.filter((m) => !backup.tables[m]));
  check("筆數跟資料庫一樣", backup.tables.User.length === (await prisma.user.count()) && backup.tables.DeliveryRecord.length === (await prisma.deliveryRecord.count()));
  check("不含密碼", backup.tables.User.every((u) => !("passwordHash" in u)));
  const status = (await api(admin, "GET", "/backup/status")).json;
  check("記下備份時間與人", !!status.lastBackupAt && Date.now() - Date.parse(String(status.lastBackupAt)) < 60000 && !!status.lastBackupByName, status);
  check("只有董事長能下載", (await api(financeUser, "GET", "/backup/export")).status === 403);
  const todosFresh = (await api(admin, "GET", "/home/todos")).json.todos as { key: string }[];
  check("剛備份過不提醒", !todosFresh.some((t) => t.key === "backup"));
  await prisma.salarySettings.update({ where: { id: 1 }, data: { lastBackupAt: new Date(Date.now() - 10 * 86400000) } });
  const todosOld = (await api(admin, "GET", "/home/todos")).json.todos as { key: string; title: string }[];
  check("超過 7 天首頁提醒", todosOld.some((t) => t.key === "backup" && t.title.includes("10 天")), todosOld.filter((t) => t.key === "backup"));

  console.log("固定收支範本");
  const parties = (await api(admin, "GET", "/finance/parties")).json as unknown as { id: string; isActive: boolean }[];
  const cats = (await api(admin, "GET", "/finance/categories")).json as unknown as { id: string; kind: string; isActive: boolean }[];
  const partyId = parties.find((p) => p.isActive)!.id;
  const expenseCat = cats.find((c) => c.kind === "EXPENSE" && c.isActive)!.id;
  const incomeCat = cats.find((c) => c.kind === "INCOME" && c.isActive)!.id;
  const bad = await api(admin, "POST", "/finance/recurring", { name: "E2E錯分類", type: "EXPENSE", partyId, categoryId: incomeCat, amount: 100, dayOfMonth: 5 });
  check("支出配收入分類被擋", bad.status === 400, bad.json);
  check("記帳職務不能管理範本", (await api(financeUser, "GET", "/finance/recurring?year=2019&month=2")).status === 403);
  const rent = await api(admin, "POST", "/finance/recurring", { name: "E2E房租", type: "EXPENSE", partyId, categoryId: expenseCat, amount: 25000, dayOfMonth: 31, note: "E2E固定" });
  check("新增範本", rent.status === 201, rent.json);
  templateIds.push(rent.json.id as string);
  const list = async () => (await api(admin, "GET", "/finance/recurring?year=2019&month=2")).json as unknown as Item[];
  const feb = (await list()).find((i) => i.id === rent.json.id);
  check("過去月份算到期、31 號在 2 月算月底", feb?.state === "due" && feb.dueDate.startsWith("2019-02-28"), feb);
  const applied = await api(admin, "POST", "/finance/recurring/apply", { year: 2019, month: 2, ids: [rent.json.id] });
  check("帶入 1 筆", applied.json.created === 1, applied.json);
  const afterApply = (await list()).find((i) => i.id === rent.json.id)!;
  const record = await prisma.financeRecord.findUnique({ where: { id: afterApply.recordId! } });
  check("帳目日期、金額、備註正確且已核准", record?.amount === 25000 && record.date.toISOString().startsWith("2019-02-28") && !!record.note?.includes("E2E房租") && record.status === "APPROVED", record);
  check("同一個月不能再帶", (await api(admin, "POST", "/finance/recurring/apply", { year: 2019, month: 2, ids: [rent.json.id] })).status === 409);
  await api(admin, "DELETE", `/finance/records/${afterApply.recordId}`);
  check("刪掉帳目後回到還沒記", (await list()).find((i) => i.id === rent.json.id)?.state === "due");
  check("標記這個月不用", (await api(admin, "POST", `/finance/recurring/${rent.json.id}/skip`, { year: 2019, month: 2 })).status === 201);
  check("顯示這個月不用", (await list()).find((i) => i.id === rent.json.id)?.state === "skipped");
  check("略過的不會被帶入", (await api(admin, "POST", "/finance/recurring/apply", { year: 2019, month: 2, ids: [rent.json.id] })).status === 409);
  check("取消不用", (await api(admin, "DELETE", `/finance/recurring/${rent.json.id}/skip/2019/2`)).status === 204);
  check("回到還沒記", (await list()).find((i) => i.id === rent.json.id)?.state === "due");

  console.log("本月提醒");
  const phone = await api(admin, "POST", "/finance/recurring", { name: "E2E電話費", type: "EXPENSE", partyId, categoryId: expenseCat, amount: 699, dayOfMonth: 1, note: "E2E固定" });
  templateIds.push(phone.json.id as string);
  const todos = (await api(admin, "GET", "/home/todos")).json.todos as { key: string; detail?: string }[];
  check("本月過了繳款日首頁提醒", todos.some((t) => t.key === "recurring" && !!t.detail?.includes("E2E電話費")), todos.filter((t) => t.key === "recurring"));
  await api(admin, "PUT", `/finance/recurring/${phone.json.id}`, { name: "E2E電話費", type: "EXPENSE", partyId, categoryId: expenseCat, amount: 699, dayOfMonth: 1, isActive: false });
  const todos2 = (await api(admin, "GET", "/home/todos")).json.todos as { key: string; detail?: string }[];
  check("停用後不提醒", !todos2.some((t) => t.key === "recurring" && t.detail?.includes("E2E電話費")));
  check("刪除範本", (await api(admin, "DELETE", `/finance/recurring/${phone.json.id}`)).status === 204);

  console.log("清理測試資料");
  await cleanup();
  check("測試資料已清除", (await prisma.financeRecurring.count({ where: { id: { in: templateIds } } })) === 0);

  console.log(`\n結果：${passed} 通過／${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    await cleanup().catch(() => {});
  })
  .finally(() => prisma.$disconnect());
