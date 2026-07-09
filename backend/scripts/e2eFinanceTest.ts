// 記帳模組端對端實測（本機 dev 環境）：
// 記帳 CRUD → 造測試來源資料 → 帶入中心四來源 → 防重複 → 來源變動警告 → 匯出
// 用法：npx tsx scripts/e2eFinanceTest.ts（需先啟動 backend dev server）
// 結束時會清除所有造出的測試資料。

import { prisma } from "../src/lib/prisma";
import { parseDateOnly } from "../src/utils/date";

const BASE = "http://localhost:4000/api";
let TOKEN = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

async function main() {
  // 登入
  const login = await api("POST", "/auth/login", {
    email: "local-admin@test.com",
    password: "test1234",
  });
  TOKEN = (login.json as { token: string }).token;
  check("管理員登入", Boolean(TOKEN));

  const parties = (await api("GET", "/finance/parties")).json as { id: string; name: string }[];
  const categories = (await api("GET", "/finance/categories")).json as {
    id: string; kind: string; name: string;
  }[];
  const chen = parties.find((p) => p.name === "陳彥旭")!;
  const lee = parties.find((p) => p.name === "李泓玟")!;
  const misc = categories.find((c) => c.kind === "EXPENSE" && c.name === "雜支")!;

  // ── 記帳 CRUD ──
  console.log("記帳 CRUD");
  const created = await api("POST", "/finance/records", {
    date: "2026-07-09", type: "EXPENSE", partyId: chen.id,
    categoryId: misc.id, amount: 123, note: "E2E 測試帳目",
  });
  check("新增支出帳目", created.status === 201);
  const recId = (created.json as { id: string }).id;

  const updated = await api("PUT", `/finance/records/${recId}`, {
    date: "2026-07-09", type: "EXPENSE", partyId: lee.id,
    categoryId: misc.id, amount: 456, note: "E2E 測試帳目（改）",
  });
  check("編輯帳目", updated.status === 200 && (updated.json as { amount: number }).amount === 456);

  const badCategory = await api("POST", "/finance/records", {
    date: "2026-07-09", type: "INCOME", partyId: chen.id,
    categoryId: misc.id, amount: 10,
  });
  check("收入帳配支出分類被拒", badCategory.status === 400);

  const transfer = await api("POST", "/finance/records", {
    date: "2026-07-09", type: "TRANSFER", partyId: lee.id,
    counterPartyId: chen.id, amount: 5000, note: "E2E 撥款測試",
  });
  check("內部撥款單筆建立", transfer.status === 201);
  const transferId = (transfer.json as { id: string }).id;

  check("刪除帳目", (await api("DELETE", `/finance/records/${recId}`)).status === 204);
  check("刪除撥款", (await api("DELETE", `/finance/records/${transferId}`)).status === 204);

  // ── 造帶入來源測試資料（2026/07） ──
  console.log("帶入中心（造 2026/07 測試來源）");
  const admin = await prisma.user.findUnique({ where: { email: "local-admin@test.com" } });
  const vehicle = await prisma.vehicle.upsert({
    where: { plateNumber: "E2E-999" },
    create: { plateNumber: "E2E-999", type: "MOTORCYCLE" },
    update: {},
  });
  const fuel1 = await prisma.fuelReport.create({
    data: {
      date: parseDateOnly("2026-07-02"), amount: 300, status: "APPROVED",
      employeeId: admin!.id, vehicleId: vehicle.id,
    },
  });
  const fuel2 = await prisma.fuelReport.create({
    data: {
      date: parseDateOnly("2026-07-03"), amount: 200, status: "APPROVED",
      employeeId: admin!.id, vehicleId: vehicle.id,
    },
  });
  const parking1 = await prisma.parkingFeeReport.create({
    data: {
      date: parseDateOnly("2026-07-04"), amount: 90, status: "APPROVED",
      employeeId: admin!.id, vehicleId: vehicle.id,
    },
  });
  const log1 = await prisma.maintenanceLog.create({
    data: {
      vehicleId: vehicle.id, date: parseDateOnly("2026-07-05"), mileage: 100,
      itemName: "E2E 換機油", cost: 1500, category: "MAINTENANCE",
    },
  });

  const status1 = (await api("GET", "/finance/import-center?year=2026&month=7")).json as {
    fuel: { sourceCount: number; pendingTotal: number };
    parking: { sourceCount: number };
    maintenance: { pending: { sourceId: string }[] };
    salary: { extra?: { monthLocked?: boolean } };
  };
  check("帶入中心：油資來源 2 筆共 500", status1.fuel.sourceCount === 2 && status1.fuel.pendingTotal === 500, status1.fuel);
  check("帶入中心：停車費來源 1 筆", status1.parking.sourceCount === 1);
  check("帶入中心：維修待帶入含測試履歷", status1.maintenance.pending.some((p) => p.sourceId === log1.id));
  check("帶入中心：7 月薪資未封存標記", status1.salary.extra?.monthLocked === false);

  // 帶入油資（彙總一筆）
  const fuelImport = await api("POST", "/finance/import-center/fuel", { year: 2026, month: 7 });
  check("油資帶入成功（彙總一筆）", fuelImport.status === 201 && (fuelImport.json as { amount: number }).amount === 500, fuelImport.json);
  const fuelRecordId = (fuelImport.json as { id: string }).id;

  // 防重複：再帶一次應失敗
  const fuelAgain = await api("POST", "/finance/import-center/fuel", { year: 2026, month: 7 });
  check("重複帶入被擋", fuelAgain.status === 400 || fuelAgain.status === 409, fuelAgain);

  // 帶入停車費與維修
  const parkingImport = await api("POST", "/finance/import-center/parking", { year: 2026, month: 7 });
  check("停車費帶入成功", parkingImport.status === 201);
  const parkingRecordId = (parkingImport.json as { id: string }).id;

  const maintImport = await api("POST", "/finance/import-center/maintenance", {
    year: 2026, month: 7, logIds: [log1.id],
  });
  check("維修履歷帶入成功", maintImport.status === 201);
  const maintRecordIds = (maintImport.json as { id: string }[]).map((r) => r.id);

  // 來源變動警告：修改已帶入的加油金額
  await prisma.fuelReport.update({ where: { id: fuel1.id }, data: { amount: 999 } });
  const status2 = (await api("GET", "/finance/import-center?year=2026&month=7")).json as {
    warnings: { message: string }[];
  };
  check("來源金額變更出現警告", status2.warnings.length >= 1, status2.warnings);

  // 刪除帳目 → 釋放連結 → 可重新帶入
  await api("DELETE", `/finance/records/${fuelRecordId}`);
  const status3 = (await api("GET", "/finance/import-center?year=2026&month=7")).json as {
    fuel: { pending: unknown[] };
  };
  check("刪除帳目後來源可重新帶入", status3.fuel.pending.length === 2, status3.fuel);

  // ── 報表與匯出 ──
  console.log("報表與匯出");
  const report = (await api("GET", "/finance/report?year=2026&month=6")).json as {
    summary: { incomeTotal: number; expenseTotal: number; net: number };
  };
  check(
    "6 月報表數字（589000/581854/7146）",
    report.summary.incomeTotal === 589000 &&
      report.summary.expenseTotal === 581854 &&
      report.summary.net === 7146,
    report.summary
  );

  const yearly = (await api("GET", "/finance/report/yearly?year=2026")).json as {
    months: { month: number; incomeTotal: number }[];
  };
  check("年度總覽 6 月收入 589000", yearly.months[5].incomeTotal === 589000);

  const excelRes = await fetch(`${BASE}/finance/report/export?year=2026&month=6`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const excelBuf = Buffer.from(await excelRes.arrayBuffer());
  check("Excel 匯出（ZIP 檔頭）", excelRes.status === 200 && excelBuf.subarray(0, 2).toString() === "PK", excelBuf.length);

  const pdfRes = await fetch(`${BASE}/finance/report/export-pdf?year=2026&month=6`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  check("PDF 匯出（%PDF 檔頭）", pdfRes.status === 200 && pdfBuf.subarray(0, 4).toString() === "%PDF", pdfBuf.length);
  require("fs").writeFileSync("scripts/e2e-report-2026-06.pdf", pdfBuf);
  console.log(`  （PDF 已存至 scripts/e2e-report-2026-06.pdf，${pdfBuf.length} bytes）`);

  // ── 清理測試資料 ──
  console.log("清理測試資料");
  await api("DELETE", `/finance/records/${parkingRecordId}`);
  for (const id of maintRecordIds) await api("DELETE", `/finance/records/${id}`);
  await prisma.fuelReport.deleteMany({ where: { id: { in: [fuel1.id, fuel2.id] } } });
  await prisma.parkingFeeReport.delete({ where: { id: parking1.id } });
  await prisma.maintenanceLog.delete({ where: { id: log1.id } });
  await prisma.vehicle.delete({ where: { id: vehicle.id } });
  const leftover = await prisma.financeRecord.count({ where: { sourceType: { not: "IMPORT" } } });
  check("測試帳目已全部清除", leftover === 0, leftover);

  console.log(`\n結果：${passed} 通過／${failed} 失敗`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
