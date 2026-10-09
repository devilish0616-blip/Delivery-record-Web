// 薪資改善端對端實測（v1.47）：
// 封存後才核准的油資算進下一個還沒封存的月份（上月補報）、舊資料補救的 SQL → 停用的員工當月有紀錄照樣算薪資與封存
// → 加項（計入實領、封存後不能改）→ Excel 總表欄位加得起來 → 全部薪資單合併成一份 PDF
// → 員工自己下載薪資單（封存後才可以）與確認薪資單（確認無誤／有疑問、重新封存後要重新確認）
// 用法：npx tsx scripts/e2eSalaryV147Test.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料。

import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma";
import { taipeiParts } from "../src/utils/date";

const BASE = "http://localhost:4000/api";
const EMAILS = ["e2e-v147-a@test.com", "e2e-v147-b@test.com"];
// 用很久以前的月份測，避免碰到本機真的資料
const LATE = { year: 2019, month: 3 }; // 封存後才核准油資的月份
const MAIN = { year: 2019, month: 5 }; // 停用員工、加項、匯出、確認

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) return { status: res.status, json: {} as Record<string, unknown>, type, buf: Buffer.from(await res.arrayBuffer()) };
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json, type, buf: Buffer.alloc(0) };
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return ((await res.json()) as { token: string }).token;
}

type Salary = {
  userId: string;
  totalSalary: number;
  totalSalaryExcludingSubsidy: number;
  fuelAllowance: number;
  fuelAllowanceItems: { id: string; carriedFrom?: string | null }[];
  additionTotal: number;
  inactive?: boolean;
  locked?: boolean;
  ack?: { status: string; note: string | null; outdated: boolean } | null;
};

const startedAt = new Date();
let vehicleId = "";

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.fuelReport.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.deliveryRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.salaryAddition.deleteMany({ where: { userId: { in: ids } } });
  await prisma.salaryAck.deleteMany({ where: { userId: { in: ids } } });
  for (const m of [LATE, MAIN]) {
    await prisma.salarySnapshot.deleteMany({ where: m });
    await prisma.salaryMonthLock.deleteMany({ where: m });
  }
  await prisma.salarySnapshot.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ createdAt: { gte: startedAt } }, { targetUserId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
}

async function main() {
  await cleanup();
  const passwordHash = await bcrypt.hash("test1234", 10);
  const a = await prisma.user.create({ data: { email: EMAILS[0], passwordHash, name: "E2E薪資甲", role: "EMPLOYEE" } });
  const b = await prisma.user.create({ data: { email: EMAILS[1], passwordHash, name: "E2E薪資乙", role: "EMPLOYEE" } });
  const vehicle = await prisma.vehicle.create({ data: { plateNumber: `E2S-${Date.now() % 100000}`, type: "MOTORCYCLE" } });
  vehicleId = vehicle.id;
  const admin = await login("local-admin@test.com", "test1234");
  const empA = await login(EMAILS[0], "test1234");

  console.log("封存後才核准的油資（上月補報）");
  const report = (await api(empA, "POST", "/fuel-reports", { date: "2019-03-28", amount: 380, vehicleId })).json;
  await api(admin, "POST", "/salary/lock", LATE);
  const approved = await api(admin, "PUT", `/fuel-reports/${report.id}/approve`);
  const tw = taipeiParts();
  check("核准時說明計入的月份", approved.json.carriedTo === `${tw.year} 年 ${tw.month} 月`, approved.json);
  const row = await prisma.fuelReport.findUnique({ where: { id: report.id as string } });
  check("payMonth 是本月", row?.payMonth?.toISOString() === new Date(Date.UTC(tw.year, tw.month - 1, 1)).toISOString(), row?.payMonth);
  const curSalary = (await api(admin, "GET", `/salary/${a.id}?year=${tw.year}&month=${tw.month}`)).json as Salary;
  const carriedItem = curSalary.fuelAllowanceItems.find((i) => i.id === report.id);
  check("算進本月薪資並標出上月補報", carriedItem?.carriedFrom === "2019-03", curSalary.fuelAllowanceItems);
  const lateSalary = (await api(admin, "GET", `/salary/${a.id}?year=${LATE.year}&month=${LATE.month}`)).json as Salary;
  check("封存的那個月不受影響", lateSalary.fuelAllowance === 0, lateSalary.fuelAllowance);
  const audit = await prisma.auditLog.findFirst({ where: { targetUserId: a.id, action: "APPROVE" }, orderBy: { createdAt: "desc" } });
  check("操作紀錄寫明計入哪個月", !!audit?.summary.includes("該月已封存"), audit?.summary);

  console.log("一般月份照回報日期");
  const normal = (await api(empA, "POST", "/fuel-reports", { date: "2019-04-02", amount: 200, vehicleId })).json;
  const normalApproved = await api(admin, "PUT", `/fuel-reports/${normal.id}/approve`);
  check("沒封存的月份不算補報", normalApproved.json.carriedTo === null, normalApproved.json);
  const aprSalary = (await api(admin, "GET", `/salary/${a.id}?year=2019&month=4`)).json as Salary;
  check("算在回報日期的月份", aprSalary.fuelAllowance === 200, aprSalary.fuelAllowance);

  console.log("以前漏掉的回報（上線時的補救 SQL）");
  // 模擬舊資料：3 月封存後才核准、payMonth 卻是 3 月（員工沒領到）
  const legacy = await prisma.fuelReport.create({
    data: {
      date: new Date(Date.UTC(2019, 2, 20)), amount: 150, vehicleId, employeeId: a.id, status: "APPROVED",
      reviewedAt: new Date(), payMonth: new Date(Date.UTC(2019, 2, 1)),
    },
  });
  await prisma.$executeRawUnsafe(`
    UPDATE "FuelReport" f SET "payMonth" = (
      SELECT m FROM generate_series(
        date_trunc('month', f."reviewedAt" + interval '8 hours'),
        date_trunc('month', f."reviewedAt" + interval '8 hours') + interval '36 months',
        interval '1 month'
      ) AS m
      WHERE NOT EXISTS (
        SELECT 1 FROM "SalaryMonthLock" l
        WHERE l."year" = EXTRACT(YEAR FROM m)::int AND l."month" = EXTRACT(MONTH FROM m)::int
      )
      ORDER BY m LIMIT 1
    )
    WHERE f."id" = '${legacy.id}' AND f."status" = 'APPROVED' AND f."reviewedAt" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "SalaryMonthLock" l
      WHERE l."year" = EXTRACT(YEAR FROM f."date")::int AND l."month" = EXTRACT(MONTH FROM f."date")::int
        AND f."reviewedAt" > l."lockedAt"
    )`);
  const fixed = await prisma.fuelReport.findUnique({ where: { id: legacy.id } });
  check("漏掉的回報改算進本月", fixed?.payMonth?.toISOString() === new Date(Date.UTC(tw.year, tw.month - 1, 1)).toISOString(), fixed?.payMonth);

  console.log("停用的員工當月有紀錄照樣算");
  await prisma.deliveryRecord.createMany({
    data: [
      { userId: b.id, date: new Date(Date.UTC(2019, 4, 6)), forwardCount: 50, reverseCount: 5 },
      { userId: b.id, date: new Date(Date.UTC(2019, 4, 7)), forwardCount: 40, reverseCount: 4 },
      { userId: a.id, date: new Date(Date.UTC(2019, 4, 6)), forwardCount: 60, reverseCount: 0 },
    ],
  });
  await api(admin, "PATCH", `/employees/${b.id}/status`, { isActive: false });
  const mainList = (await api(admin, "GET", `/salary?year=${MAIN.year}&month=${MAIN.month}`)).json as { salaries: Salary[] };
  const bRow = mainList.salaries.find((x) => x.userId === b.id);
  check("停用員工出現在薪資表並標示", !!bRow && bRow.inactive === true, bRow);
  check("停用員工薪資照算", (bRow?.totalSalary ?? 0) > 0, bRow?.totalSalary);

  console.log("加項");
  const before = (await api(admin, "GET", `/salary/${a.id}?year=${MAIN.year}&month=${MAIN.month}`)).json as Salary;
  const add = await api(admin, "POST", "/salary/additions", { userId: a.id, ...MAIN, amount: 1200, reason: "E2E獎金" });
  check("新增加項", add.status === 201, add.json);
  const after = (await api(admin, "GET", `/salary/${a.id}?year=${MAIN.year}&month=${MAIN.month}`)).json as Salary;
  check("加項計入實領", after.totalSalary === before.totalSalary + 1200 && after.additionTotal === 1200, [before.totalSalary, after.totalSalary]);
  check("加項計入未含補貼", after.totalSalaryExcludingSubsidy === before.totalSalaryExcludingSubsidy + 1200);
  const tempAdd = await api(admin, "POST", "/salary/additions", { userId: a.id, ...MAIN, amount: 50, reason: "刪掉" });
  check("刪除加項", (await api(admin, "DELETE", `/salary/additions/${tempAdd.json.id}`)).status === 204);
  check("員工不能新增加項", (await api(empA, "POST", "/salary/additions", { userId: a.id, ...MAIN, amount: 1, reason: "x" })).status === 403);

  console.log("員工下載與確認（還沒封存）");
  check("沒封存不能下載薪資單", (await api(empA, "GET", `/salary/me/export?year=${MAIN.year}&month=${MAIN.month}`)).status === 409);
  check("沒封存不能確認", (await api(empA, "POST", "/salary/me/ack", { ...MAIN, status: "CONFIRMED" })).status === 409);

  console.log("封存（含停用員工）");
  await api(admin, "POST", "/salary/lock", MAIN);
  const snapB = await prisma.salarySnapshot.findUnique({ where: { userId_year_month: { userId: b.id, ...MAIN } } });
  check("停用員工有封存快照", !!snapB);
  check("封存後不能新增加項", (await api(admin, "POST", "/salary/additions", { userId: a.id, ...MAIN, amount: 1, reason: "x" })).status === 409);

  console.log("Excel 總表");
  const xlsx = await api(admin, "GET", `/salary/export?year=${MAIN.year}&month=${MAIN.month}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx.buf as never);
  const sheet = wb.getWorksheet("薪資總表")!;
  const headers = (sheet.getRow(1).values as unknown[]).map(String);
  check("有加項、扣款、未含補貼、油資、停車費欄", ["加項", "扣款", "未含補貼", "油資補貼", "停車費補貼"].every((h) => headers.includes(h)), headers);
  const col = (name: string) => headers.indexOf(name);
  let consistent = true;
  sheet.eachRow((r, n) => {
    if (n === 1) return;
    const v = (name: string) => Number(r.getCell(col(name)).value ?? 0);
    if (Math.abs(v("未含補貼") + v("油資補貼") + v("停車費補貼") - v("總薪資")) > 0.01) consistent = false;
  });
  check("每一列 未含補貼＋油資＋停車費＝總薪資（含合計列）", consistent);
  const lastRow = sheet.getRow(sheet.rowCount);
  check("最後一列是合計", String(lastRow.getCell(1).value) === "合計");
  check("停用員工在 Excel 標示", JSON.stringify(sheet.getColumn(1).values).includes("E2E薪資乙（已停用）"));

  console.log("全部薪資單一份 PDF");
  const slips = await api(admin, "GET", `/salary/slips/export?year=${MAIN.year}&month=${MAIN.month}&userIds=${a.id},${b.id}`);
  check("下載合併 PDF", slips.status === 200 && slips.type.includes("pdf") && slips.buf.subarray(0, 4).toString() === "%PDF", slips.status);
  const pageCount = (slips.buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check("兩個人至少兩頁", pageCount >= 2, pageCount);

  console.log("員工下載與確認（封存後）");
  const mine = await api(empA, "GET", `/salary/me/export?year=${MAIN.year}&month=${MAIN.month}`);
  check("封存後可以下載自己的薪資單", mine.status === 200 && mine.buf.subarray(0, 4).toString() === "%PDF", mine.status);
  check("有疑問一定要寫原因", (await api(empA, "POST", "/salary/me/ack", { ...MAIN, status: "QUESTION" })).status === 400);
  const q = await api(empA, "POST", "/salary/me/ack", { ...MAIN, status: "QUESTION", note: "5/6 應該是 61 件" });
  check("回報有疑問", q.status === 200 && q.json.status === "QUESTION", q.json);
  const acks = (await api(admin, "GET", `/salary/acks?year=${MAIN.year}&month=${MAIN.month}`)).json as unknown as { userId: string; status: string; note: string; outdated: boolean }[];
  const ackA = acks.find((x) => x.userId === a.id);
  check("董事長看得到疑問與留言", ackA?.status === "QUESTION" && ackA.note.includes("61"), acks);
  const ok = await api(empA, "POST", "/salary/me/ack", { ...MAIN, status: "CONFIRMED" });
  check("改成確認無誤", ok.json.status === "CONFIRMED");
  const me = (await api(empA, "GET", `/salary/me?year=${MAIN.year}&month=${MAIN.month}`)).json as Salary;
  check("我的薪資帶回確認狀態", me.ack?.status === "CONFIRMED" && me.ack.outdated === false, me.ack);

  console.log("重新封存後要重新確認");
  await api(admin, "POST", "/salary/unlock", MAIN);
  await new Promise((r) => setTimeout(r, 20));
  await api(admin, "POST", "/salary/lock", MAIN);
  const me2 = (await api(empA, "GET", `/salary/me?year=${MAIN.year}&month=${MAIN.month}`)).json as Salary;
  check("重新封存後舊確認過期", me2.ack?.outdated === true, me2.ack);

  console.log("清理測試資料");
  await cleanup();
  check("測試資料已清除", (await prisma.user.count({ where: { email: { in: EMAILS } } })) === 0);

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
