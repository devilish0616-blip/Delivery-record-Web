// 登入與帳號端對端實測（v1.46）：
// Email 不分大小寫、前後空白 → 每次打開換發新憑證 → 本人改密碼（舊密碼錯擋下、改完舊憑證失效、新憑證可用）
// → 董事長重設密碼後本人舊憑證失效 → 連續打錯 5 次暫停登入 → 已審核的請假不能再審 → 有加油回報的帳號刪除時說明原因
// 用法：npx tsx scripts/e2eAccountTest.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料。

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api";
const EMP_EMAIL = "e2e-account-employee@test.com";
const LOCK_EMAIL = "e2e-account-lock@test.com";
const EMAILS = [EMP_EMAIL, LOCK_EMAIL];

async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

const login = (email: string, password: string) => api(null, "POST", "/auth/login", { email, password });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const startedAt = new Date();
let vehicleId = "";

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.fuelReport.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.leaveRequest.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ createdAt: { gte: startedAt } }, { targetUserId: { in: ids } }, { actorId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
}

async function main() {
  await cleanup();
  const passwordHash = await bcrypt.hash("test1234", 10);
  const emp = await prisma.user.create({ data: { email: EMP_EMAIL, passwordHash, name: "E2E帳號員工", role: "EMPLOYEE" } });
  await prisma.user.create({ data: { email: LOCK_EMAIL, passwordHash, name: "E2E鎖定員工", role: "EMPLOYEE" } });
  const vehicle = await prisma.vehicle.create({ data: { plateNumber: `E2A-${Date.now() % 100000}`, type: "MOTORCYCLE" } });
  vehicleId = vehicle.id;

  console.log("Email 不分大小寫");
  const adminRes = await login("  LOCAL-Admin@Test.com ", "test1234");
  check("大寫＋前後空白也能登入", adminRes.status === 200, adminRes.json);
  const admin = adminRes.json.token as string;
  const upperEmp = await login("E2E-Account-Employee@TEST.com", "test1234");
  check("員工 Email 大小寫不同也能登入", upperEmp.status === 200, upperEmp.json);
  let empToken = upperEmp.json.token as string;

  console.log("每次打開換發新憑證");
  const me = await api(empToken, "GET", "/auth/me");
  check("/auth/me 回傳新憑證", me.status === 200 && typeof me.json.token === "string", me.json);
  const meAgain = await api(me.json.token as string, "GET", "/auth/me");
  check("新憑證可以使用", meAgain.status === 200 && meAgain.json.id === emp.id);

  console.log("本人改密碼");
  const wrong = await api(empToken, "PUT", "/auth/password", { currentPassword: "nope", newPassword: "newpass1" });
  check("目前密碼錯誤被擋下", wrong.status === 400 && String(wrong.json.error).includes("目前的密碼不對"), wrong.json);
  const short = await api(empToken, "PUT", "/auth/password", { currentPassword: "test1234", newPassword: "123" });
  check("新密碼太短被擋下", short.status === 400, short.json);
  // 憑證以秒為單位，等過一秒，確保改密碼的時間晚於舊憑證簽發時間
  await sleep(1100);
  const changed = await api(empToken, "PUT", "/auth/password", { currentPassword: "test1234", newPassword: "newpass1" });
  check("改密碼成功並回傳新憑證", changed.status === 200 && typeof changed.json.token === "string", changed.json);
  const oldTokenUse = await api(empToken, "GET", "/auth/me");
  check("改密碼後舊憑證失效", oldTokenUse.status === 401 && String(oldTokenUse.json.error).includes("密碼已變更"), oldTokenUse.json);
  empToken = changed.json.token as string;
  check("改密碼後新憑證可用", (await api(empToken, "GET", "/auth/me")).status === 200);
  check("舊密碼不能登入", (await login(EMP_EMAIL, "test1234")).status === 401);
  const newLogin = await login(EMP_EMAIL, "newpass1");
  check("新密碼可以登入", newLogin.status === 200);
  const audit = await prisma.auditLog.findFirst({ where: { targetUserId: emp.id, summary: "本人修改密碼" } });
  check("改密碼有操作紀錄", !!audit);

  console.log("董事長重設密碼");
  await sleep(1100);
  const reset = await api(admin, "PUT", `/employees/${emp.id}/password`, { password: "reset123" });
  check("董事長重設成功", reset.status === 200, reset.json);
  check("重設後本人舊憑證失效", (await api(empToken, "GET", "/auth/me")).status === 401);
  const afterReset = await login(EMP_EMAIL, "reset123");
  check("用重設的密碼登入", afterReset.status === 200);
  empToken = afterReset.json.token as string;

  console.log("連續打錯暫停登入");
  for (let i = 0; i < 5; i++) await login(LOCK_EMAIL, "wrong-password");
  const locked = await login(LOCK_EMAIL, "test1234");
  check("錯 5 次後密碼對也暫停", locked.status === 429 && String(locked.json.error).includes("分鐘後再試"), locked.json);
  const lockedUpper = await login("E2E-ACCOUNT-LOCK@test.com", "test1234");
  check("換大小寫也一樣暫停", lockedUpper.status === 429);
  check("其他帳號不受影響", (await login(EMP_EMAIL, "reset123")).status === 200);

  console.log("請假不能重複審核");
  const leave = await api(empToken, "POST", "/leaves", { date: "2020-01-15", reason: "E2E" });
  const leaveId = leave.json.id as string;
  check("核准請假", (await api(admin, "PATCH", `/leaves/${leaveId}/approve`)).status === 200);
  const again = await api(admin, "PATCH", `/leaves/${leaveId}/reject`);
  check("已核准的請假不能再拒絕", again.status === 400 && String(again.json.error).includes("審核過"), again.json);

  console.log("刪除有紀錄的帳號");
  await api(empToken, "POST", "/fuel-reports", { date: "2020-01-15", amount: 120, vehicleId });
  const del = await api(admin, "DELETE", `/employees/${emp.id}`);
  check(
    "有加油回報與請假時說明原因",
    del.status === 400 && String(del.json.error).includes("加油回報 1 筆") && String(del.json.error).includes("請假 1 筆"),
    del.json
  );

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
