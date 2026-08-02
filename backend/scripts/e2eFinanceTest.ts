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
  const zhi = parties.find((p) => p.name === "陳志欣")!;
  const misc = categories.find((c) => c.kind === "EXPENSE" && c.name === "雜支")!;
  const settings = (await api("GET", "/finance/settings")).json as { salaryPartyId: string | null };
  const settingsSalaryPartyId = settings.salaryPartyId;

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

  // 帶入油資（依解析出的負責關係人分組，admin 未指派負責關係人時 fallback 到全域預設，兩筆合併一組）
  const fuelImport = await api("POST", "/finance/import-center/fuel", { year: 2026, month: 7 });
  const fuelRecords = fuelImport.json as { id: string; amount: number }[];
  check(
    "油資帶入成功（未指派員工歸入同一組彙總一筆）",
    fuelImport.status === 201 && fuelRecords.length === 1 && fuelRecords[0].amount === 500,
    fuelImport.json
  );
  const fuelRecordId = fuelRecords[0].id;

  // 防重複：再帶一次應失敗
  const fuelAgain = await api("POST", "/finance/import-center/fuel", { year: 2026, month: 7 });
  check("重複帶入被擋", fuelAgain.status === 400 || fuelAgain.status === 409, fuelAgain);

  // 帶入停車費與維修
  const parkingImport = await api("POST", "/finance/import-center/parking", { year: 2026, month: 7 });
  check("停車費帶入成功", parkingImport.status === 201);
  const parkingRecordId = (parkingImport.json as { id: string }[])[0].id;

  const maintImport = await api("POST", "/finance/import-center/maintenance", {
    year: 2026, month: 7, logIds: [log1.id],
  });
  check("維修履歷帶入成功", maintImport.status === 201);
  const maintRecordIds = (maintImport.json as { id: string }[]).map((r) => r.id);

  // 已帶入來源不可略過（應改由記帳頁刪除該帳目）
  const ignoreImported = await api("POST", "/finance/import-center/ignore", {
    sourceType: "MAINTENANCE_LOG", sourceId: log1.id,
  });
  check("已帶入來源略過被拒", ignoreImported.status === 400, ignoreImported);

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

  // 略過來源（附原因）→ pending 消失、reason 正確回吐 → 還原 → 重新出現於 pending
  const ignoreFuel2 = await api("POST", "/finance/import-center/ignore", {
    sourceType: "FUEL_REPORT", sourceId: fuel2.id, reason: "E2E 測試略過原因",
  });
  check("略過來源成功", ignoreFuel2.status === 201, ignoreFuel2);

  const status4 = (await api("GET", "/finance/import-center?year=2026&month=7")).json as {
    fuel: { pending: { sourceId: string }[]; ignored: { sourceId: string; reason: string | null }[] };
  };
  check("略過後不再出現於 pending", !status4.fuel.pending.some((p) => p.sourceId === fuel2.id), status4.fuel);
  check(
    "略過原因正確回吐",
    status4.fuel.ignored.find((i) => i.sourceId === fuel2.id)?.reason === "E2E 測試略過原因",
    status4.fuel.ignored
  );

  const unignoreFuel2 = await api("DELETE", `/finance/import-center/ignore/FUEL_REPORT/${fuel2.id}`);
  check("還原略過成功", unignoreFuel2.status === 204, unignoreFuel2);

  const status5 = (await api("GET", "/finance/import-center?year=2026&month=7")).json as {
    fuel: { pending: { sourceId: string }[] };
  };
  check("還原後重新出現於 pending", status5.fuel.pending.some((p) => p.sourceId === fuel2.id), status5.fuel);

  // 逐筆勾選部分帶入（sourceIds）：只選 fuel1，fuel2 應仍留在 pending
  // 注意：fuel1.amount 已在前面「來源金額變更出現警告」測試改成 999（原本 300）
  const partialFuelImport = await api("POST", "/finance/import-center/fuel", {
    year: 2026, month: 7, sourceIds: [fuel1.id],
  });
  const partialFuelRecords = partialFuelImport.json as { id: string; amount: number }[];
  check(
    "逐筆勾選部分帶入成功（只選 fuel1）",
    partialFuelImport.status === 201 && partialFuelRecords.length === 1 && partialFuelRecords[0].amount === 999,
    partialFuelImport.json
  );
  const partialFuelRecordId = partialFuelRecords[0].id;

  const status6 = (await api("GET", "/finance/import-center?year=2026&month=7")).json as {
    fuel: { pending: { sourceId: string }[] };
  };
  check(
    "未勾選的 fuel2 仍留在 pending",
    status6.fuel.pending.length === 1 && status6.fuel.pending[0].sourceId === fuel2.id,
    status6.fuel
  );

  // ── 依人指派負責關係人（造第二個測試員工，8 月資料） ──
  console.log("帶入中心：依人指派負責關係人（造第二員工＋2026/08 測試來源）");
  const emp2 = await prisma.user.create({
    data: { email: "e2e-emp2@test.com", passwordHash: "e2e-test-not-a-real-hash", name: "E2E員工二" },
  });

  const assignResult = await api("PUT", `/finance/employee-parties/${emp2.id}`, {
    responsiblePartyId: zhi.id,
  });
  check("指派員工負責關係人成功", assignResult.status === 200, assignResult);

  const empPartiesList = (await api("GET", "/finance/employee-parties")).json as {
    userId: string; responsiblePartyId: string | null;
  }[];
  check(
    "員工負責關係人清單含指派結果",
    empPartiesList.find((e) => e.userId === emp2.id)?.responsiblePartyId === zhi.id,
    empPartiesList
  );

  const fuelAdminAug = await prisma.fuelReport.create({
    data: {
      date: parseDateOnly("2026-08-02"), amount: 120, status: "APPROVED",
      employeeId: admin!.id, vehicleId: vehicle.id,
    },
  });
  const fuelEmp2Aug = await prisma.fuelReport.create({
    data: {
      date: parseDateOnly("2026-08-03"), amount: 80, status: "APPROVED",
      employeeId: emp2.id, vehicleId: vehicle.id,
    },
  });
  const parkingEmp2Aug = await prisma.parkingFeeReport.create({
    data: {
      date: parseDateOnly("2026-08-04"), amount: 40, status: "APPROVED",
      employeeId: emp2.id, vehicleId: vehicle.id,
    },
  });

  const augStatus = (await api("GET", "/finance/import-center?year=2026&month=8")).json as {
    fuel: { pending: { sourceId: string; resolvedPartyId: string | null }[] };
  };
  const adminItem = augStatus.fuel.pending.find((p) => p.sourceId === fuelAdminAug.id);
  const emp2Item = augStatus.fuel.pending.find((p) => p.sourceId === fuelEmp2Aug.id);
  check("未指派員工的來源 resolvedPartyId 為 null", (adminItem?.resolvedPartyId ?? null) === null, adminItem);
  check("已指派員工的來源 resolvedPartyId 正確", emp2Item?.resolvedPartyId === zhi.id, emp2Item);

  const augFuelImport = await api("POST", "/finance/import-center/fuel", { year: 2026, month: 8 });
  const augFuelRecords = augFuelImport.json as { id: string; partyId: string; amount: number }[];
  check(
    "依關係人分組帶入成功（2 筆不同關係人）",
    augFuelImport.status === 201 && augFuelRecords.length === 2,
    augFuelImport.json
  );
  check(
    "未指派員工歸入全域預設關係人",
    augFuelRecords.some((r) => r.partyId === chen.id && r.amount === 120),
    augFuelRecords
  );
  check(
    "已指派員工歸入其指派的關係人",
    augFuelRecords.some((r) => r.partyId === zhi.id && r.amount === 80),
    augFuelRecords
  );

  const augParkingImport = await api("POST", "/finance/import-center/parking", { year: 2026, month: 8 });
  const augParkingRecords = augParkingImport.json as { id: string; partyId: string; amount: number }[];
  check(
    "停車費依關係人分組帶入成功",
    augParkingImport.status === 201 &&
      augParkingRecords.length === 1 &&
      augParkingRecords[0].partyId === zhi.id &&
      augParkingRecords[0].amount === 40,
    augParkingImport.json
  );

  // 帶入中心逐筆下拉選單覆蓋（partyOverrides）：admin 未指派負責關係人，正常應 fallback 到全域預設（陳彥旭），
  // 但這筆手動改選李泓玟，驗證 partyOverrides 優先權高於員工指派與全域預設
  const fuelOverrideAug = await prisma.fuelReport.create({
    data: {
      date: parseDateOnly("2026-08-05"), amount: 55, status: "APPROVED",
      employeeId: admin!.id, vehicleId: vehicle.id,
    },
  });
  const overrideImport = await api("POST", "/finance/import-center/fuel", {
    year: 2026, month: 8, partyOverrides: { [fuelOverrideAug.id]: lee.id },
  });
  const overrideRecords = overrideImport.json as { id: string; partyId: string; amount: number }[];
  check(
    "單筆 partyOverrides 覆蓋成功",
    overrideImport.status === 201 &&
      overrideRecords.length === 1 &&
      overrideRecords[0].partyId === lee.id &&
      overrideRecords[0].amount === 55,
    overrideImport.json
  );

  // ── 一鍵帶入本月（造 2026/09 測試來源，含薪資已封存分支） ──
  console.log("帶入中心：一鍵帶入本月（造 2026/09 測試來源）");
  const fuel9 = await prisma.fuelReport.create({
    data: {
      date: parseDateOnly("2026-09-02"), amount: 150, status: "APPROVED",
      employeeId: admin!.id, vehicleId: vehicle.id,
    },
  });
  const parking9 = await prisma.parkingFeeReport.create({
    data: {
      date: parseDateOnly("2026-09-03"), amount: 60, status: "APPROVED",
      employeeId: admin!.id, vehicleId: vehicle.id,
    },
  });
  const maint9 = await prisma.maintenanceLog.create({
    data: {
      vehicleId: vehicle.id, date: parseDateOnly("2026-09-04"), mileage: 200,
      itemName: "E2E 9月測試項目", cost: 800, category: "MAINTENANCE",
    },
  });

  const quick1 = (await api("POST", "/finance/import-center/quick-import", { year: 2026, month: 9 }))
    .json as {
    salary: { skipReason: string | null };
    fuel: { imported: boolean; count: number; totalAmount: number };
    parking: { imported: boolean; count: number; totalAmount: number };
    maintenancePending: { count: number; totalAmount: number };
  };
  check("一鍵帶入：薪資未封存被跳過", quick1.salary.skipReason === "該月份薪資尚未封存", quick1.salary);
  check(
    "一鍵帶入：油資帶入 1 筆 150",
    quick1.fuel.imported && quick1.fuel.count === 1 && quick1.fuel.totalAmount === 150,
    quick1.fuel
  );
  check(
    "一鍵帶入：停車費帶入 1 筆 60",
    quick1.parking.imported && quick1.parking.count === 1 && quick1.parking.totalAmount === 60,
    quick1.parking
  );
  check(
    "一鍵帶入：附帶維修待處理提示 1 筆 800",
    quick1.maintenancePending.count === 1 && quick1.maintenancePending.totalAmount === 800,
    quick1.maintenancePending
  );

  const quick2 = (await api("POST", "/finance/import-center/quick-import", { year: 2026, month: 9 }))
    .json as { fuel: { skipReason: string | null }; parking: { skipReason: string | null } };
  check(
    "一鍵帶入：重複執行油資/停車費顯示無待帶入",
    quick2.fuel.skipReason === "本月無待帶入項目" && quick2.parking.skipReason === "本月無待帶入項目",
    quick2
  );

  // 薪資已封存分支：admin 未指派負責關係人（fallback 全域預設）、emp2 已指派（陳志欣）
  await prisma.salaryMonthLock.create({ data: { year: 2026, month: 9, lockedById: admin!.id } });
  await prisma.salarySnapshot.create({
    data: {
      userId: admin!.id, year: 2026, month: 9,
      data: { userName: "E2E管理員", totalSalary: 30000, fuelAllowance: 0, parkingFeeAllowance: 0 },
    },
  });
  await prisma.salarySnapshot.create({
    data: {
      userId: emp2.id, year: 2026, month: 9,
      data: { userName: "E2E員工二", totalSalary: 25000, fuelAllowance: 0, parkingFeeAllowance: 0 },
    },
  });

  const quick3 = (await api("POST", "/finance/import-center/quick-import", { year: 2026, month: 9 }))
    .json as { salary: { imported: boolean; count: number; totalAmount: number } };
  check(
    "一鍵帶入：薪資已封存後帶入 2 筆共 55000",
    quick3.salary.imported && quick3.salary.count === 2 && quick3.salary.totalAmount === 55000,
    quick3.salary
  );

  // 薪資帶入一律以「今天」為入帳日期（非該月月底），故不能用 9 月日期範圍查詢，直接依 sourceType 撈取
  const septRecords = await prisma.financeRecord.findMany({ where: { sourceType: "SALARY_SNAPSHOT" } });
  check(
    "薪資依人分組：admin 歸全域預設、emp2 歸其指派的關係人",
    septRecords.some((r) => r.partyId === settingsSalaryPartyId && r.amount === 30000) &&
      septRecords.some((r) => r.partyId === zhi.id && r.amount === 25000),
    septRecords
  );

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
  await api("DELETE", `/finance/records/${partialFuelRecordId}`);
  for (const id of maintRecordIds) await api("DELETE", `/finance/records/${id}`);
  // 8/9 月的帳目改用日期範圍刪除，不依賴一鍵帶入的回傳值（quick-import 不回傳建立出的 record id）
  await prisma.financeRecord.deleteMany({
    where: {
      date: { gte: new Date("2026-08-01"), lt: new Date("2026-10-01") },
      sourceType: { in: ["FUEL_REPORT", "PARKING_FEE_REPORT"] },
    },
  });
  // 薪資帶入一律以「今天」為入帳日期，不落在 8/9 月範圍內，改依 sourceType 整批清除
  await prisma.financeRecord.deleteMany({ where: { sourceType: "SALARY_SNAPSHOT" } });
  await prisma.fuelReport.deleteMany({
    where: { id: { in: [fuel1.id, fuel2.id, fuelAdminAug.id, fuelEmp2Aug.id, fuelOverrideAug.id, fuel9.id] } },
  });
  await prisma.parkingFeeReport.deleteMany({
    where: { id: { in: [parking1.id, parkingEmp2Aug.id, parking9.id] } },
  });
  await prisma.maintenanceLog.deleteMany({ where: { id: { in: [log1.id, maint9.id] } } });
  await prisma.salarySnapshot.deleteMany({ where: { year: 2026, month: 9 } });
  await prisma.salaryMonthLock.deleteMany({ where: { year: 2026, month: 9 } });
  await prisma.user.delete({ where: { id: emp2.id } });
  await prisma.vehicle.delete({ where: { id: vehicle.id } });
  const leftover = await prisma.financeRecord.count({ where: { sourceType: { not: "IMPORT" } } });
  check("測試帳目已全部清除", leftover === 0, leftover);

  console.log(`\n結果：${passed} 通過／${failed} 失敗`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
