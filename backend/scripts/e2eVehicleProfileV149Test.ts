// 車輛與員工資料卡端對端實測（v1.49）：
// 一次登記多個保養項目（費用記在第一筆、各項保養提醒重算）→ 續保／驗車／繳稅（到期日延後、有費用才記花費、車輛管理職務可用）
// → 員工資料卡（董事長維護、本人改電話與緊急聯絡人、操作紀錄）→ 駕照快到期首頁提醒
// 用法：npx tsx scripts/e2eVehicleProfileV149Test.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料。

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { taipeiToday, toDateOnlyString } from "../src/utils/date";

const BASE = "http://localhost:4000/api";
const EMAILS = ["e2e-v149-emp@test.com", "e2e-v149-fleet@test.com"];

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

const startedAt = new Date();
let vehicleId = "";

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (vehicleId) {
    await prisma.maintenanceLog.deleteMany({ where: { vehicleId } });
    await prisma.vehicleMaintenanceItem.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  }
  await prisma.auditLog.deleteMany({ where: { OR: [{ createdAt: { gte: startedAt } }, { targetUserId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  await cleanup();
  const passwordHash = await bcrypt.hash("test1234", 10);
  const emp = await prisma.user.create({ data: { email: EMAILS[0], passwordHash, name: "E2E資料卡員工", role: "EMPLOYEE" } });
  await prisma.user.create({ data: { email: EMAILS[1], passwordHash, name: "E2E車輛組長", role: "EMPLOYEE", extraCapabilities: ["MANAGE_VEHICLES"] } });
  const admin = await login("local-admin@test.com");
  const empToken = await login(EMAILS[0]);
  const fleet = await login(EMAILS[1]);

  const created = await api(admin, "POST", "/vehicles", { plateNumber: `E2V9-${Date.now() % 100000}`, type: "MOTORCYCLE", initialMileage: 4000 });
  vehicleId = created.json.id as string;
  const items = await prisma.vehicleMaintenanceItem.findMany({ where: { vehicleId }, orderBy: { createdAt: "asc" } });
  check("新車有預設保養項目", items.length >= 2, items.map((i) => i.itemName));

  console.log("一次登記多個保養項目");
  const svc = await api(fleet, "POST", `/vehicles/${vehicleId}/maintenance/service`, {
    itemIds: [items[1].id, items[0].id], date: "2026-09-20", mileage: 5000, cost: 1200, vendor: "阿明機車行",
  });
  check("車輛管理職務可以登記", svc.status === 201 && svc.json.registered === 2, svc.json);
  const logs = await prisma.maintenanceLog.findMany({ where: { vehicleId }, orderBy: { createdAt: "asc" } });
  check("每個項目各一筆履歷", logs.length === 2, logs.map((l) => l.itemName));
  const first = logs.find((l) => l.itemName === items[0].itemName);
  const second = logs.find((l) => l.itemName === items[1].itemName);
  check("費用整筆記在第一個項目", first?.cost === 1200 && second?.cost === 0, [first?.cost, second?.cost]);
  check("其他項目註明同次保養", !!second?.note?.includes(`費用記在「${items[0].itemName}」`), second?.note);
  const after = await prisma.vehicleMaintenanceItem.findMany({ where: { id: { in: [items[0].id, items[1].id] } } });
  check("兩個項目的保養基準都更新", after.every((i) => i.lastChangeMileage === 5000), after.map((i) => i.lastChangeMileage));
  check("車輛里程跟著更新", (await prisma.vehicle.findUnique({ where: { id: vehicleId } }))?.currentMileage === 5000);
  check("沒勾項目被擋", (await api(admin, "POST", `/vehicles/${vehicleId}/maintenance/service`, { itemIds: [] })).status === 400);
  check("別台車的項目被擋", (await api(admin, "POST", `/vehicles/${vehicleId}/maintenance/service`, { itemIds: ["nope"] })).status === 404);
  check("一般員工不能登記", (await api(empToken, "POST", `/vehicles/${vehicleId}/maintenance/service`, { itemIds: [items[0].id] })).status === 403);

  console.log("續保、驗車、繳稅");
  const renew = await api(fleet, "POST", `/vehicles/${vehicleId}/documents/insuranceCompulsoryExpiry/renew`, {
    nextDate: "2027-10-01", paidDate: "2026-09-25", cost: 1500, vendor: "富邦產險",
  });
  check("車輛管理職務可以續保", renew.status === 200 && !!renew.json.logId, renew.json);
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  check("強制險到期日延後", toDateOnlyString(v!.insuranceCompulsoryExpiry!) === "2027-10-01");
  const insLog = await prisma.maintenanceLog.findUnique({ where: { id: renew.json.logId as string } });
  check("記一筆保險花費", insLog?.category === "INSURANCE" && insLog.cost === 1500 && insLog.itemName === "強制險續保", insLog);
  const inspect = await api(admin, "POST", `/vehicles/${vehicleId}/documents/inspectionExpiry/renew`, { nextDate: "2027-09-01" });
  check("沒填費用只改到期日", inspect.status === 200 && inspect.json.logId === null, inspect.json);
  check("不支援的項目被擋", (await api(admin, "POST", `/vehicles/${vehicleId}/documents/nope/renew`, { nextDate: "2027-01-01" })).status === 400);
  const tax = await api(admin, "POST", `/vehicles/${vehicleId}/documents/licenseTaxDueDate/renew`, { nextDate: "2027-04-30", cost: 450 });
  const taxLog = await prisma.maintenanceLog.findUnique({ where: { id: tax.json.logId as string } });
  check("繳稅記成其他花費", taxLog?.category === "OTHER" && taxLog.itemName === "牌照稅", taxLog);

  console.log("員工資料卡");
  const prof = await api(admin, "PATCH", `/employees/${emp.id}/profile`, {
    phone: "0912-345-678", hireDate: "2025-03-01", licenseType: "普通重型機車", licenseExpiry: "2030-01-01",
  });
  check("董事長填資料卡", prof.status === 200 && prof.json.phone === "0912-345-678", prof.json);
  const list = (await api(admin, "GET", "/employees")).json as unknown as { id: string; hireDate: string | null; licenseType: string | null }[];
  const row = list.find((u) => u.id === emp.id);
  check("員工列表帶出資料卡", row?.hireDate?.slice(0, 10) === "2025-03-01" && row.licenseType === "普通重型機車", row);
  const audit = await prisma.auditLog.findFirst({ where: { targetUserId: emp.id, summary: "帳號資料" }, orderBy: { createdAt: "desc" } });
  check("資料卡修改有操作紀錄", JSON.stringify(audit?.changes ?? []).includes("到職日"), audit?.changes);
  const self = await api(empToken, "PUT", "/auth/profile", { phone: "0988-000-111", emergencyContact: "王媽媽 0922-222-333" });
  check("本人改電話與緊急聯絡人", self.status === 200 && self.json.phone === "0988-000-111", self.json);
  const me = (await api(empToken, "GET", "/auth/me")).json;
  check("我的帳號帶出資料卡", me.emergencyContact === "王媽媽 0922-222-333" && me.licenseType === "普通重型機車", me);
  const sneaky = await api(empToken, "PUT", "/auth/profile", { licenseExpiry: "2099-01-01" });
  const afterSneaky = await prisma.user.findUnique({ where: { id: emp.id }, select: { licenseExpiry: true } });
  check("本人不能改駕照到期日", sneaky.status === 200 && toDateOnlyString(afterSneaky!.licenseExpiry!) === "2030-01-01");

  console.log("駕照快到期提醒");
  const soon = new Date(taipeiToday().getTime() + 10 * 86400000);
  await api(admin, "PATCH", `/employees/${emp.id}/profile`, { licenseExpiry: toDateOnlyString(soon) });
  const adminTodos = (await api(admin, "GET", "/home/todos")).json.todos as { key: string; title: string }[];
  check("董事長首頁提醒員工駕照", adminTodos.some((t) => t.key === `license-${emp.id}` && t.title.includes("10 天後到期")), adminTodos.filter((t) => t.key.startsWith("license")));
  const myTodos = (await api(empToken, "GET", "/home/todos")).json.todos as { key: string; title: string }[];
  check("本人首頁也提醒", myTodos.some((t) => t.key === "my-license" && t.title.includes("10 天後到期")), myTodos);
  await api(admin, "PATCH", `/employees/${emp.id}/profile`, { licenseExpiry: null });
  const cleared = (await api(admin, "GET", "/home/todos")).json.todos as { key: string }[];
  check("清掉到期日後不再提醒", !cleared.some((t) => t.key === `license-${emp.id}`));

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
