// 資料檢查（異常偵測）＋週報端對端實測：
// 件數多打一個 0、里程倒退、同車同天兩筆加油、每公里油錢暴增 → 董事長／執行長看得到、員工看不到
// → 「沒問題」收起來、首頁提醒跟著變 → 資料改正後異常自動消失
// → 週報數字與資料庫一致、週一換算、未來的週被擋、員工不能看
// 用法：npx tsx scripts/e2eDataChecksTest.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料。

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api";
const EMAILS = ["e2e-checks-employee@test.com", "e2e-checks-manager@test.com", "e2e-checks-idle@test.com"];

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return ((await res.json()) as { token: string }).token;
}

function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function mondayOf(d: Date) {
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

type Item = { key: string; kind: string; title: string; dismissed: boolean; to: string };
type Checks = { from: string; to: string; items: Item[] };
type Weekly = {
  start: string; end: string;
  totals: { forward: number; reverse: number; total: number; attendance: number; revenue: number | null; fuel: number };
  employees: { userId: string; days: number; total: number }[];
  absent: string[];
};

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const vehicles = await prisma.vehicle.findMany({ where: { plateNumber: { startsWith: "E2C-" } }, select: { id: true } });
  const vIds = vehicles.map((v) => v.id);
  await prisma.fuelReport.deleteMany({ where: { OR: [{ employeeId: { in: ids } }, { vehicleId: { in: vIds } }] } });
  await prisma.mileageRecord.deleteMany({ where: { OR: [{ userId: { in: ids } }, { vehicleId: { in: vIds } }] } });
  await prisma.deliveryRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.vehicle.deleteMany({ where: { id: { in: vIds } } });
  await prisma.anomalyDismissal.deleteMany({ where: { dismissedById: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  await cleanup();
  const passwordHash = await bcrypt.hash("test1234", 10);
  const emp = await prisma.user.create({ data: { email: EMAILS[0], passwordHash, name: "E2E檢查員工", role: "EMPLOYEE" } });
  await prisma.user.create({ data: { email: EMAILS[1], passwordHash, name: "E2E檢查執行長", role: "MANAGER" } });
  const idle = await prisma.user.create({ data: { email: EMAILS[2], passwordHash, name: "E2E沒出勤", role: "EMPLOYEE" } });

  const now = new Date();
  const today = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  // 送件：最近 10 天正常（約 55 件），倒數第 3 天多打一個 0
  const typoDay = addDays(today, -3);
  for (let i = 1; i <= 10; i++) {
    const date = addDays(today, -i);
    const forward = date.getTime() === typoDay.getTime() ? 580 : 50 + (i % 4) * 3;
    await prisma.deliveryRecord.create({ data: { userId: emp.id, date, forwardCount: forward, reverseCount: 4 } });
  }

  // 里程倒退的機車
  const stamp = Date.now() % 10000;
  const moto = await prisma.vehicle.create({ data: { plateNumber: `E2C-M${stamp}`, type: "MOTORCYCLE", currentMileage: 0 } });
  await prisma.mileageRecord.create({ data: { userId: emp.id, vehicleId: moto.id, date: addDays(today, -5), endMileage: 2000 } });
  await prisma.mileageRecord.create({ data: { userId: emp.id, vehicleId: moto.id, date: addDays(today, -4), endMileage: 2080 } });
  await prisma.mileageRecord.create({ data: { userId: emp.id, vehicleId: moto.id, date: addDays(today, -2), endMileage: 1960 } });
  // 同車同天兩筆加油
  await prisma.fuelReport.create({ data: { employeeId: emp.id, vehicleId: moto.id, date: addDays(today, -2), amount: 380 } });
  await prisma.fuelReport.create({ data: { employeeId: emp.id, vehicleId: moto.id, date: addDays(today, -2), amount: 380 } });

  // 每公里油錢：上個月 2.9 元／km，前三個月約 1.8
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const monthStart = (back: number) => utc(y, m - back, 1);
  const monthEnd = (back: number) => addDays(utc(y, m - back + 1, 1), -1);
  const truck = await prisma.vehicle.create({ data: { plateNumber: `E2C-T${stamp}`, type: "TRUCK", currentMileage: 0 } });
  const readings = [
    { date: monthEnd(5), end: 10000 },
    { date: monthEnd(4), end: 11000 },
    { date: monthEnd(3), end: 12050 },
    { date: monthEnd(2), end: 13000 },
    { date: monthEnd(1), end: 14000 },
  ];
  for (const r of readings) {
    await prisma.mileageRecord.create({ data: { userId: emp.id, vehicleId: truck.id, date: r.date, endMileage: r.end } });
  }
  const fuelByMonth = [
    { back: 4, amount: 1800 },
    { back: 3, amount: 1900 },
    { back: 2, amount: 1700 },
    { back: 1, amount: 2900 },
  ];
  for (const f of fuelByMonth) {
    await prisma.fuelReport.create({
      data: { employeeId: emp.id, vehicleId: truck.id, date: addDays(monthStart(f.back), 9), amount: f.amount, status: "APPROVED" },
    });
  }

  const adminToken = await login("local-admin@test.com", "test1234");
  const managerToken = await login(EMAILS[1], "test1234");
  const empToken = await login(EMAILS[0], "test1234");

  console.log("資料檢查");
  const res = await api(adminToken, "GET", "/checks");
  const checks = res.json as Checks;
  const mine = (kind: string) => checks.items.filter((i) => i.kind === kind && i.title.includes(kind.startsWith("delivery") ? "E2E檢查員工" : "E2C-"));
  check("董事長查得到", res.status === 200 && Array.isArray(checks.items), res.json);
  const typo = mine("delivery-high")[0];
  check("抓到送件多打一個 0", !!typo && typo.title.includes("584") && typo.to.includes(`user=${emp.id}`), checks.items);
  check("抓到里程倒退", mine("mileage-back").some((i) => i.title.includes(`E2C-M${stamp}`)), checks.items.map((i) => i.title));
  check("抓到同車同天兩筆加油", mine("fuel-duplicate").length === 1, checks.items.map((i) => i.title));
  const rate = mine("fuel-rate").find((i) => i.title.includes(`E2C-T${stamp}`));
  check("抓到每公里油錢暴增", !!rate && rate.title.includes("$2.9"), checks.items.map((i) => i.title));
  check("每月一筆的里程不會被誤判成一天開太多", !checks.items.some((i) => i.kind === "mileage-jump" && i.title.includes(`E2C-T${stamp}`)));
  check("執行長也查得到", (await api(managerToken, "GET", "/checks")).status === 200);
  check("一般員工不能看", (await api(empToken, "GET", "/checks")).status === 403);

  const todosBefore = ((await api(adminToken, "GET", "/home/todos")).json as { todos: { key: string; title: string }[] }).todos;
  const todoBefore = todosBefore.find((t) => t.key === "data-checks");
  check("首頁提醒有資料要確認", !!todoBefore, todosBefore.map((t) => t.key));

  console.log("沒問題／取消");
  await api(adminToken, "POST", "/checks/dismiss", { key: mine("fuel-duplicate")[0].key });
  const afterDismiss = (await api(adminToken, "GET", "/checks")).json as Checks;
  check("按沒問題後標為已確認", afterDismiss.items.find((i) => i.kind === "fuel-duplicate" && i.title.includes("E2C-"))?.dismissed === true);
  const todoAfter = ((await api(adminToken, "GET", "/home/todos")).json as { todos: { key: string; title: string }[] }).todos.find((t) => t.key === "data-checks");
  const countOf = (t?: { title: string }) => Number(t?.title.match(/^(\d+)/)?.[1] ?? 0);
  check("首頁待確認數少一筆", countOf(todoAfter) === countOf(todoBefore) - 1, [todoBefore?.title, todoAfter?.title]);
  await api(managerToken, "POST", "/checks/undismiss", { key: mine("fuel-duplicate")[0].key });
  const afterUndo = (await api(adminToken, "GET", "/checks")).json as Checks;
  check("取消確認後回到待確認", afterUndo.items.find((i) => i.kind === "fuel-duplicate" && i.title.includes("E2C-"))?.dismissed === false);
  check("沒帶 key 被擋", (await api(adminToken, "POST", "/checks/dismiss", {})).status === 400);

  console.log("改正資料後自動消失");
  await api(adminToken, "PUT", `/deliveries/${emp.id}/${ymd(typoDay)}`, { forwardCount: 58, reverseCount: 4, note: null });
  const afterFix = (await api(adminToken, "GET", "/checks")).json as Checks;
  check("件數改正後不再列出", !afterFix.items.some((i) => i.kind === "delivery-high" && i.title.includes("E2E檢查員工")), afterFix.items.map((i) => i.title));

  console.log("週報");
  const weekStart = mondayOf(addDays(today, -7));
  const wed = addDays(weekStart, 2);
  const wr = await api(adminToken, "GET", `/reports/weekly?start=${ymd(wed)}`);
  const weekly = wr.json as Weekly;
  check("週三換算成那週週一", wr.status === 200 && weekly.start === ymd(weekStart) && weekly.end === ymd(addDays(weekStart, 6)), wr.json);
  const rows = await prisma.deliveryRecord.findMany({ where: { date: { gte: weekStart, lt: addDays(weekStart, 7) } } });
  const expectTotal = rows.reduce((s, r) => s + r.forwardCount + r.reverseCount, 0);
  check("件數與資料庫一致", weekly.totals.total === expectTotal && weekly.totals.attendance === rows.length, [weekly.totals, expectTotal]);
  const mineWeek = weekly.employees.find((e) => e.userId === emp.id);
  const myRows = rows.filter((r) => r.userId === emp.id);
  check("每人這週的天數與件數正確", mineWeek?.days === myRows.length && mineWeek?.total === myRows.reduce((s, r) => s + r.forwardCount + r.reverseCount, 0), mineWeek);
  check("沒送件的在職員工列在名單", weekly.absent.includes("E2E沒出勤") && !weekly.absent.includes(idle.name + "X"), weekly.absent);
  const pricingRows = await prisma.monthlyPricing.findMany();
  if (pricingRows.length === 0) {
    check("沒設定單價時營收為 null 或 0", weekly.totals.revenue === null || weekly.totals.revenue === 0, weekly.totals);
  } else {
    check("有單價時算出營收", typeof weekly.totals.revenue === "number", weekly.totals);
  }
  const lastWeek = (await api(adminToken, "GET", "/reports/weekly")).json as Weekly;
  check("預設是上週", lastWeek.start === ymd(mondayOf(addDays(today, -7))), lastWeek.start);
  check("還沒到的週被擋", (await api(adminToken, "GET", `/reports/weekly?start=${ymd(addDays(mondayOf(today), 7))}`)).status === 400);
  check("日期格式錯誤被擋", (await api(adminToken, "GET", "/reports/weekly?start=2026-9-1")).status === 400);
  check("執行長看得到週報", (await api(managerToken, "GET", "/reports/weekly")).status === 200);
  check("一般員工不能看週報", (await api(empToken, "GET", "/reports/weekly")).status === 403);

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
