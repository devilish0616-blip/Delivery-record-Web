// 請假、送件回報、審核端對端實測（v1.48）：
// 一次請多天（同一組、重疊的日子略過）、假別、一次核准整段、取消整段 → 行事曆帶假別、今日收工帶請假
// → 請假與「不用填送件」不算沒填（營運總覽送件回報、首頁人數、自己的收工提醒、週報）
// → 油資一次核准多筆、審核參考資訊（這個月第幾筆、這台車上次加油、重複報帳標記）
// → 資料檢查新規則（有里程沒送件、請假當天有送件、貨車司機沒填貨車里程）
// 用法：npx tsx scripts/e2eLeaveReviewV148Test.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料。

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { taipeiToday, toDateOnlyString } from "../src/utils/date";

const BASE = "http://localhost:4000/api";
const EMAILS = ["e2e-v148-a@test.com", "e2e-v148-b@test.com"];

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
  else { failed++; console.error(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test1234" }),
  });
  return ((await res.json()) as { token: string }).token;
}

const today = taipeiToday();
const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000);
const ds = (d: Date) => toDateOnlyString(d);
const startedAt = new Date();
let vehicleId = "";
let truckId = "";

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.fuelReport.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.leaveRequest.deleteMany({ where: { userId: { in: ids } } });
  await prisma.deliveryRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mileageRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.dailyRoleRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ createdAt: { gte: startedAt } }, { targetUserId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  for (const id of [vehicleId, truckId]) if (id) await prisma.vehicle.deleteMany({ where: { id } });
}

async function main() {
  await cleanup();
  const passwordHash = await bcrypt.hash("test1234", 10);
  const a = await prisma.user.create({ data: { email: EMAILS[0], passwordHash, name: "E2E請假甲", role: "EMPLOYEE" } });
  const b = await prisma.user.create({ data: { email: EMAILS[1], passwordHash, name: "E2E請假乙", role: "EMPLOYEE" } });
  vehicleId = (await prisma.vehicle.create({ data: { plateNumber: `E2L8-${Date.now() % 100000}`, type: "MOTORCYCLE" } })).id;
  truckId = (await prisma.vehicle.create({ data: { plateNumber: `E2T8-${Date.now() % 100000}`, type: "TRUCK" } })).id;
  const admin = await login("local-admin@test.com");
  const empA = await login(EMAILS[0]);

  console.log("一次請多天");
  const multi = await api(empA, "POST", "/leaves", { startDate: "2019-07-01", endDate: "2019-07-03", type: "PERSONAL", reason: "回老家" });
  check("一次建立 3 天", multi.status === 201 && multi.json.created === 3, multi.json);
  const group = await prisma.leaveRequest.findMany({ where: { userId: a.id, date: { gte: new Date("2019-07-01"), lte: new Date("2019-07-03") } } });
  check("3 天同一組、假別事假", group.length === 3 && new Set(group.map((l) => l.groupId)).size === 1 && !!group[0].groupId && group.every((l) => l.type === "PERSONAL"));
  const overlap = await api(empA, "POST", "/leaves", { startDate: "2019-07-03", endDate: "2019-07-04", type: "SICK" });
  check("重疊的日子略過", overlap.json.created === 1 && JSON.stringify(overlap.json.skipped) === JSON.stringify(["2019-07-03"]), overlap.json);
  check("同一天再請一次被擋", (await api(empA, "POST", "/leaves", { date: "2019-07-04", type: "SICK" })).status === 409);
  check("結束早於開始被擋", (await api(empA, "POST", "/leaves", { startDate: "2019-07-05", endDate: "2019-07-04" })).status === 400);
  check("一次超過 31 天被擋", (await api(empA, "POST", "/leaves", { startDate: "2019-08-01", endDate: "2019-09-05" })).status === 400);

  console.log("一次核准整段、取消整段");
  const batch = await api(admin, "POST", "/leaves/review-batch", { ids: group.map((l) => l.id), action: "approve" });
  check("一次核准 3 天", batch.json.updated === 3, batch.json);
  check("已審核的不能再批次審核", (await api(admin, "POST", "/leaves/review-batch", { ids: group.map((l) => l.id), action: "reject" })).status === 400);
  check("員工不能批次審核", (await api(empA, "POST", "/leaves/review-batch", { ids: group.map((l) => l.id), action: "approve" })).status === 403);
  const audit = await prisma.auditLog.findFirst({ where: { targetUserId: a.id, action: "APPROVE", summary: { contains: "3 天" } } });
  check("批次核准有操作紀錄", !!audit, audit?.summary);
  check("已核准的整段不能由本人取消", (await api(empA, "DELETE", `/leaves/group/${group[0].groupId}`)).status === 400);
  const cancelGroup = await api(empA, "POST", "/leaves", { startDate: "2019-07-10", endDate: "2019-07-11", type: "DAY_OFF" });
  const cg = await prisma.leaveRequest.findFirst({ where: { userId: a.id, date: new Date("2019-07-10") } });
  const del = await api(empA, "DELETE", `/leaves/group/${cg?.groupId}`);
  check("取消待審核的整段", cancelGroup.json.created === 2 && del.json.deleted === 2, del.json);

  console.log("行事曆與今日收工帶假別");
  const cal = (await api(empA, "GET", "/events?year=2019&month=7")).json as { leaves: { userId: string; type: string }[] };
  check("行事曆請假帶假別", cal.leaves.some((l) => l.userId === a.id && l.type === "PERSONAL"), cal.leaves.filter((l) => l.userId === a.id));
  const entry = (await api(empA, "GET", "/daily-entry?date=2019-07-02")).json as { leave: { type: string; status: string } | null };
  check("今日收工帶出這天的請假", entry.leave?.type === "PERSONAL" && entry.leave.status === "APPROVED", entry.leave);

  console.log("請假與「不用填送件」不算沒填");
  const dash = (await api(admin, "GET", "/dashboard?date=2019-07-02")).json as {
    dailyStatus: { employees: { userId: string; leave: { status: string } | null; noDeliveryRequired: boolean }[] };
  };
  check("送件回報帶出當天請假", dash.dailyStatus.employees.find((e) => e.userId === a.id)?.leave?.status === "APPROVED");
  const missingBefore = Number(((await api(admin, "GET", "/home/todos")).json.todos as { key: string; title: string }[]).find((t) => t.key === "missing-delivery")?.title.match(/(\d+)/)?.[1] ?? 0);
  const prof = await api(admin, "PATCH", `/employees/${b.id}/profile`, { noDeliveryRequired: true });
  check("設定不用填送件", prof.status === 200 && prof.json.noDeliveryRequired === true, prof.json);
  await api(empA, "POST", "/leaves", { date: ds(today), type: "DAY_OFF" });
  const todosAfter = (await api(admin, "GET", "/home/todos")).json.todos as { key: string; title: string }[];
  const missingAfter = Number(todosAfter.find((t) => t.key === "missing-delivery")?.title.match(/(\d+)/)?.[1] ?? 0);
  check("首頁沒填人數少了 2（不用填＋今天請假）", missingAfter === missingBefore - 2, [missingBefore, missingAfter]);
  const myTodos = (await api(empA, "GET", "/home/todos")).json.todos as { key: string }[];
  check("今天請假的人不提醒收工", !myTodos.some((t) => t.key === "my-delivery"));
  const dashToday = (await api(admin, "GET", `/dashboard?date=${ds(today)}`)).json as typeof dash;
  check("送件回報標出不用填送件", dashToday.dailyStatus.employees.find((e) => e.userId === b.id)?.noDeliveryRequired === true);
  const weekly = (await api(admin, "GET", `/reports/weekly?start=${ds(today)}`)).json as { absent: string[] };
  check("週報沒送件名單不列不用填的人", !weekly.absent.some((n) => n.startsWith("E2E請假乙")), weekly.absent);

  console.log("油資一次核准多筆與審核參考");
  await prisma.fuelReport.create({ data: { employeeId: a.id, vehicleId, date: daysAgo(5), amount: 300, status: "APPROVED", reviewedAt: new Date(), payMonth: new Date(Date.UTC(daysAgo(5).getUTCFullYear(), daysAgo(5).getUTCMonth(), 1)) } });
  const r1 = (await api(empA, "POST", "/fuel-reports", { date: ds(daysAgo(2)), amount: 380, vehicleId })).json;
  const r2 = (await api(empA, "POST", "/fuel-reports", { date: ds(daysAgo(2)), amount: 380, vehicleId })).json;
  const ctx = (await api(admin, "GET", "/review/expense-context?kind=fuel")).json as Record<string, { monthCount: number; lastDaysAgo: number | null; flag: string | null }>;
  check("參考：同車同天標記重複", !!ctx[r1.id as string]?.flag && !!ctx[r2.id as string]?.flag, [ctx[r1.id as string], ctx[r2.id as string]]);
  check("參考：這台車上次加油 0 天前（同一天另一筆）", ctx[r1.id as string]?.lastDaysAgo === 0, ctx[r1.id as string]);
  check("參考：這個月至少第 2 筆", (ctx[r1.id as string]?.monthCount ?? 0) >= 2, ctx[r1.id as string]);
  check("員工看不到審核參考", (await api(empA, "GET", "/review/expense-context?kind=fuel")).status === 403);
  const approveBatch = await api(admin, "POST", "/fuel-reports/approve-batch", { ids: [r1.id, r2.id] });
  check("一次核准 2 筆", approveBatch.json.approved === 2, approveBatch.json);
  const approvedRows = await prisma.fuelReport.findMany({ where: { id: { in: [r1.id as string, r2.id as string] } } });
  check("都已核准並決定計入月份", approvedRows.every((r) => r.status === "APPROVED" && r.payMonth));
  check("已核准的不能再批次核准", (await api(admin, "POST", "/fuel-reports/approve-batch", { ids: [r1.id] })).status === 400);

  console.log("資料檢查新規則");
  await prisma.mileageRecord.create({ data: { userId: a.id, vehicleId, date: daysAgo(3), endMileage: 12345 } });
  const leaveDay = daysAgo(4);
  await prisma.leaveRequest.create({ data: { userId: a.id, date: leaveDay, type: "PERSONAL", status: "APPROVED" } });
  await prisma.deliveryRecord.create({ data: { userId: a.id, date: leaveDay, forwardCount: 30, reverseCount: 0 } });
  await prisma.deliveryRecord.create({ data: { userId: a.id, date: daysAgo(6), forwardCount: 40, reverseCount: 2 } });
  await prisma.dailyRoleRecord.create({ data: { userId: a.id, date: daysAgo(6), role: "TRUCK_DRIVER" } });
  const checks = (await api(admin, "GET", "/checks")).json as { items: { kind: string; date: string; title: string }[] };
  const mine = checks.items.filter((i) => i.title.includes("E2E請假甲"));
  check("有里程沒送件", mine.some((i) => i.kind === "missing-delivery" && i.date === ds(daysAgo(3))), mine);
  check("請假當天有送件", mine.some((i) => i.kind === "leave-with-delivery" && i.date === ds(leaveDay)), mine);
  check("貨車司機沒填貨車里程", mine.some((i) => i.kind === "driver-no-truck" && i.date === ds(daysAgo(6))), mine);
  await prisma.mileageRecord.create({ data: { userId: a.id, vehicleId: truckId, date: daysAgo(6), endMileage: 500 } });
  await prisma.deliveryRecord.create({ data: { userId: a.id, date: daysAgo(3), forwardCount: 20, reverseCount: 0 } });
  const checks2 = (await api(admin, "GET", "/checks")).json as typeof checks;
  const mine2 = checks2.items.filter((i) => i.title.includes("E2E請假甲"));
  check("補填後這兩項消失", !mine2.some((i) => i.kind === "missing-delivery" || i.kind === "driver-no-truck"), mine2);

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
