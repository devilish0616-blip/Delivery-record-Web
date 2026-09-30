// 代填送件＋帳號改名端對端實測：
// 建「代管帳號」長輩員工、一般員工、執行長 → 執行長只能代填代管帳號、董事長可代填所有人
// → 代填者被記錄、本人查得到、本人重填後清除代填標記 → 改名保留原始名稱、執行長不可改名
// 用法：npx tsx scripts/e2eProxyDeliveryTest.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料。

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api";
const DATE = "2026-09-29";
const EMAILS = ["e2e-proxy-elder@test.com", "e2e-proxy-normal@test.com", "e2e-proxy-manager@test.com"];

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

type ProxyDay = {
  total: number;
  week: { date: string; filled: number }[];
  entries: { userId: string; name: string; role: string; record: { forwardCount: number; enteredByName: string | null } | null }[];
};

async function main() {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const passwordHash = await bcrypt.hash("test1234", 10);
  const elder = await prisma.user.create({
    data: { email: EMAILS[0], passwordHash, name: "E2E開戶名", role: "EMPLOYEE" },
  });
  const normal = await prisma.user.create({
    data: { email: EMAILS[1], passwordHash, name: "E2E一般員工", role: "EMPLOYEE" },
  });
  await prisma.user.create({ data: { email: EMAILS[2], passwordHash, name: "E2E執行長", role: "MANAGER" } });

  const adminToken = await login("local-admin@test.com", "test1234");
  const managerToken = await login(EMAILS[2], "test1234");
  const elderToken = await login(EMAILS[0], "test1234");

  console.log("帳號名稱與代管設定");
  const rename = await api(adminToken, "PATCH", `/employees/${elder.id}/profile`, {
    name: "E2E林阿伯", accountNote: "臨時帳號，實際使用人為林阿伯", isProxyManaged: true,
  });
  const renamed = rename.json as { name: string; originalName: string; isProxyManaged: boolean };
  check("董事長改名＋備註＋設為代管", rename.status === 200 && renamed.name === "E2E林阿伯" && renamed.isProxyManaged, rename.json);
  check("第一次改名保留原始名稱", renamed.originalName === "E2E開戶名", renamed);
  const rename2 = await api(adminToken, "PATCH", `/employees/${elder.id}/profile`, { name: "E2E林金水" });
  check("再次改名仍保留最初的名稱", (rename2.json as { originalName: string }).originalName === "E2E開戶名", rename2.json);
  check("空白名稱被擋", (await api(adminToken, "PATCH", `/employees/${elder.id}/profile`, { name: "  " })).status === 400);
  check(
    "執行長不可改名",
    (await api(managerToken, "PATCH", `/employees/${elder.id}/profile`, { name: "X" })).status === 403
  );
  const list = (await api(managerToken, "GET", "/employees")).json as { id: string; accountNote: string | null; isProxyManaged: boolean }[];
  const inList = list.find((u) => u.id === elder.id);
  check("員工列表帶出備註與代管標記", inList?.accountNote === "臨時帳號，實際使用人為林阿伯" && inList.isProxyManaged === true, inList);

  console.log("代填清單與權限");
  const mgrDay = (await api(managerToken, "GET", `/deliveries/proxy?date=${DATE}`)).json as ProxyDay;
  check("執行長清單只有代管帳號", mgrDay.entries.some((e) => e.userId === elder.id) && !mgrDay.entries.some((e) => e.userId === normal.id), mgrDay.entries.map((e) => e.name));
  check("週條回傳 7 天", mgrDay.week.length === 7 && mgrDay.week.some((w) => w.date === DATE), mgrDay.week);
  const mgrAll = (await api(managerToken, "GET", `/deliveries/proxy?date=${DATE}&scope=all`)).json as ProxyDay;
  check("執行長不能用 scope=all 看到非代管帳號", !mgrAll.entries.some((e) => e.userId === normal.id));
  const adminAll = (await api(adminToken, "GET", `/deliveries/proxy?date=${DATE}&scope=all`)).json as ProxyDay;
  check("董事長 scope=all 看得到所有人", adminAll.entries.some((e) => e.userId === normal.id));
  check("一般員工不能用代填 API", (await api(elderToken, "GET", `/deliveries/proxy?date=${DATE}`)).status === 403);

  const entry = (userId: string, forwardCount: number) => ({
    userId, role: "TRUCK_ATTENDANT", forwardCount, reverseCount: 5, note: "E2E代填",
  });
  const save = await api(managerToken, "POST", "/deliveries/proxy", { date: DATE, entries: [entry(elder.id, 88)] });
  check("執行長代填代管帳號成功", save.status === 200 && (save.json as { saved: number }).saved === 1, save.json);
  check(
    "執行長代填非代管帳號被擋",
    (await api(managerToken, "POST", "/deliveries/proxy", { date: DATE, entries: [entry(normal.id, 10)] })).status === 403
  );
  check(
    "董事長可代填非代管帳號",
    (await api(adminToken, "POST", "/deliveries/proxy", { date: DATE, entries: [entry(normal.id, 10)] })).status === 200
  );

  const after = (await api(managerToken, "GET", `/deliveries/proxy?date=${DATE}`)).json as ProxyDay;
  const elderRow = after.entries.find((e) => e.userId === elder.id)!;
  check("代填後件數與角色正確", elderRow.record?.forwardCount === 88 && elderRow.role === "TRUCK_ATTENDANT", elderRow);
  check("代填者被記錄為執行長", elderRow.record?.enteredByName === "E2E執行長", elderRow.record);
  check("週條當天已填數增加", (after.week.find((w) => w.date === DATE)?.filled ?? 0) >= 1, after.week);

  const own = (await api(elderToken, "GET", `/deliveries?from=${DATE}&to=${DATE}`)).json as { enteredBy: { name: string } | null }[];
  check("本人查詢看得到是誰代填", own[0]?.enteredBy?.name === "E2E執行長", own);

  const status = (await api(adminToken, "GET", `/dashboard?date=${DATE}`)).json as {
    dailyStatus: { employees: { userId: string; isProxyManaged: boolean; enteredByName: string | null }[] };
  };
  const st = status.dailyStatus.employees.find((e) => e.userId === elder.id);
  check("員工送件狀況帶出代管與代填者", st?.isProxyManaged === true && st.enteredByName === "E2E執行長", st);

  await api(elderToken, "POST", "/deliveries", { date: DATE, forwardCount: 90, reverseCount: 5, note: "E2E本人" });
  const own2 = (await api(elderToken, "GET", `/deliveries?from=${DATE}&to=${DATE}`)).json as { forwardCount: number; enteredBy: unknown }[];
  check("本人重填後清除代填標記", own2[0]?.forwardCount === 90 && own2[0].enteredBy === null, own2);

  console.log("登入權限");
  const lock = await api(adminToken, "PATCH", `/employees/${elder.id}/profile`, { canLogin: false });
  check("董事長關閉長輩的登入", lock.status === 200 && (lock.json as { canLogin: boolean }).canLogin === false, lock.json);
  check("已登入的裝置立即失效", (await api(elderToken, "GET", "/deliveries")).status === 401);
  const blocked = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAILS[0], password: "test1234" }),
  });
  check("關閉後無法登入（403 並說明原因）", blocked.status === 403);
  check(
    "關閉登入不影響代填",
    (await api(managerToken, "POST", "/deliveries/proxy", { date: DATE, entries: [entry(elder.id, 70)] })).status === 200
  );
  const admins = (await api(adminToken, "GET", "/employees")).json as { id: string; email: string }[];
  const self = admins.find((u) => u.email === "local-admin@test.com")!;
  check(
    "不能關閉自己／董事長的登入",
    (await api(adminToken, "PATCH", `/employees/${self.id}/profile`, { canLogin: false })).status === 400
  );
  check(
    "執行長不能改登入權限",
    (await api(managerToken, "PATCH", `/employees/${elder.id}/profile`, { canLogin: true })).status === 403
  );
  await api(adminToken, "PATCH", `/employees/${elder.id}/profile`, { canLogin: true });
  check("重新開放後可以登入", Boolean(await login(EMAILS[0], "test1234")));

  console.log("代填送件職務權限");
  const position = await prisma.jobPosition.create({
    data: { name: "E2E送件助理", capabilities: ["PROXY_DELIVERY"] },
  });
  const assistant = await prisma.user.create({
    data: {
      email: "e2e-proxy-assistant@test.com", passwordHash, name: "E2E送件助理", role: "EMPLOYEE",
      jobPositions: { create: { jobPositionId: position.id } },
    },
  });
  const assistantToken = await login("e2e-proxy-assistant@test.com", "test1234");
  const aDay = await api(assistantToken, "GET", `/deliveries/proxy?date=${DATE}&scope=all`);
  const aEntries = (aDay.json as ProxyDay).entries ?? [];
  check(
    "有職務權限的員工看得到代填清單（只限代管帳號）",
    aDay.status === 200 && aEntries.some((e) => e.userId === elder.id) && !aEntries.some((e) => e.userId === normal.id),
    aDay.json
  );
  const aSave = await api(assistantToken, "POST", "/deliveries/proxy", { date: DATE, entries: [entry(elder.id, 55)] });
  const aAfter = (await api(adminToken, "GET", `/deliveries/proxy?date=${DATE}`)).json as ProxyDay;
  check(
    "助理代填成功且記錄為代填者",
    aSave.status === 200 && aAfter.entries.find((e) => e.userId === elder.id)?.record?.enteredByName === "E2E送件助理",
    aSave.json
  );
  check(
    "助理不能代填非代管帳號",
    (await api(assistantToken, "POST", "/deliveries/proxy", { date: DATE, entries: [entry(normal.id, 1)] })).status === 403
  );
  // 移除職務後權限失效；改用「直接授予」也能生效
  await prisma.userJobPosition.deleteMany({ where: { userId: assistant.id } });
  check("移除職務後無法代填", (await api(assistantToken, "GET", `/deliveries/proxy?date=${DATE}`)).status === 403);
  const grant = await api(adminToken, "PATCH", `/employees/${assistant.id}/capabilities`, { capabilities: ["PROXY_DELIVERY"] });
  check(
    "直接授予代填權限也能代填",
    grant.status === 200 && (await api(assistantToken, "GET", `/deliveries/proxy?date=${DATE}`)).status === 200,
    grant.json
  );
  const posRes = await api(adminToken, "POST", "/job-positions", { name: "E2E權限驗證", allowance: 0, capabilities: ["PROXY_DELIVERY"] });
  check("職務設定可勾選代填送件", posRes.status === 201 || posRes.status === 200, posRes.json);
  const posId = (posRes.json as { id?: string }).id;
  await prisma.user.delete({ where: { id: assistant.id } });
  await prisma.jobPosition.deleteMany({ where: { id: { in: [position.id, ...(posId ? [posId] : [])] } } });

  console.log("董事長直接新增員工");
  const created = await api(adminToken, "POST", "/employees", {
    name: "E2E新代管", canLogin: false, isProxyManaged: true, accountNote: "E2E 建立",
  });
  const newUser = created.json as { id: string; email: string };
  check("免 Email／密碼建立代管帳號", created.status === 201 && newUser.email.endsWith("@no-login.local"), created.json);
  const createdIds = [newUser.id];
  const newRow = ((await api(adminToken, "GET", "/employees")).json as { id: string; canLogin: boolean; isProxyManaged: boolean }[])
    .find((u) => u.id === newUser.id);
  check("新帳號為代管且不可登入", newRow?.isProxyManaged === true && newRow.canLogin === false, newRow);
  const inProxy = (await api(managerToken, "GET", `/deliveries/proxy?date=${DATE}`)).json as ProxyDay;
  check("新帳號立刻出現在執行長的代填清單", inProxy.entries.some((e) => e.userId === newUser.id));
  check(
    "沒有登入 Email 不能開放登入",
    (await api(adminToken, "PATCH", `/employees/${newUser.id}/profile`, { canLogin: true })).status === 400
  );
  const newEmail = "e2e-proxy-new@test.com";
  const setEmail = await api(adminToken, "PATCH", `/employees/${newUser.id}/profile`, { email: newEmail });
  await api(adminToken, "PUT", `/employees/${newUser.id}/password`, { password: "test5678" });
  const open = await api(adminToken, "PATCH", `/employees/${newUser.id}/profile`, { canLogin: true });
  check("補 Email＋設密碼後可開放登入", setEmail.status === 200 && open.status === 200, [setEmail.json, open.json]);
  check("開放後可以用新 Email 登入", Boolean(await login(newEmail, "test5678")));
  check(
    "Email 重複被擋",
    (await api(adminToken, "PATCH", `/employees/${newUser.id}/profile`, { email: EMAILS[1] })).status === 409
  );
  check(
    "一般員工帳號沒填密碼被擋",
    (await api(adminToken, "POST", "/employees", { name: "E2E缺密碼", canLogin: true, email: "e2e-nopw@test.com" })).status === 400
  );
  check(
    "執行長不能新增員工",
    (await api(managerToken, "POST", "/employees", { name: "E2E執行長建", canLogin: false })).status === 403
  );
  const reg = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "hack@no-login.local", password: "test1234", name: "X" }),
  });
  check("註冊頁不能用內部保留網域", reg.status === 400 || reg.status === 403, reg.status);
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } });

  console.log("清理測試資料");
  const ids = [elder.id, normal.id];
  await prisma.deliveryRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.dailyRoleRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  check("測試帳號已清除", (await prisma.user.count({ where: { email: { in: EMAILS } } })) === 0);

  console.log(`\n結果：${passed} 通過／${failed} 失敗`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
