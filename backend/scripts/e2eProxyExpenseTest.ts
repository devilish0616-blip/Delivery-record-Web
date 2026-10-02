// 代填加油／停車費回報端對端實測：
// 代管長輩、一般員工、執行長、具「代填送件」職務權限的員工
// → 執行長／具權限者只能代填代管帳號、董事長可代填所有人、一般員工不能代填
// → 代填者被記錄、本人與審核端看得到、代填者可撤回自己代填的待審核回報 → 核准後計入本人
// 用法：npx tsx scripts/e2eProxyExpenseTest.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料。

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api";
const DATE = "2026-09-29";
const EMAILS = [
  "e2e-pexp-elder@test.com",
  "e2e-pexp-normal@test.com",
  "e2e-pexp-manager@test.com",
  "e2e-pexp-cap@test.com",
];

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

type Report = {
  id: string;
  employeeId: string;
  amount: number;
  status: string;
  enteredBy: { name: string } | null;
};

async function main() {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const passwordHash = await bcrypt.hash("test1234", 10);
  const elder = await prisma.user.create({
    data: { email: EMAILS[0], passwordHash, name: "E2E代管長輩", role: "EMPLOYEE", isProxyManaged: true },
  });
  const normal = await prisma.user.create({
    data: { email: EMAILS[1], passwordHash, name: "E2E一般員工", role: "EMPLOYEE" },
  });
  await prisma.user.create({ data: { email: EMAILS[2], passwordHash, name: "E2E執行長", role: "MANAGER" } });
  await prisma.user.create({
    data: { email: EMAILS[3], passwordHash, name: "E2E代填組長", role: "EMPLOYEE", extraCapabilities: ["PROXY_DELIVERY"] },
  });
  const vehicle = await prisma.vehicle.create({ data: { plateNumber: `E2P-${Date.now() % 100000}`, type: "MOTORCYCLE" } });

  const adminToken = await login("local-admin@test.com", "test1234");
  const managerToken = await login(EMAILS[2], "test1234");
  const elderToken = await login(EMAILS[0], "test1234");
  const normalToken = await login(EMAILS[1], "test1234");
  const capToken = await login(EMAILS[3], "test1234");

  const body = (employeeId: string | undefined, amount: number) => ({
    date: DATE, amount, note: "E2E代填", vehicleId: vehicle.id, ...(employeeId ? { employeeId } : {}),
  });

  for (const [api_, label] of [["/fuel-reports", "加油"], ["/parking-fee-reports", "停車費"]] as const) {
    console.log(`${label}回報代填`);

    const mgrTargets = (await api(managerToken, "GET", `${api_}/proxy-targets`)).json as { id: string }[];
    check(`${label}：執行長對象只有代管帳號`, mgrTargets.some((t) => t.id === elder.id) && !mgrTargets.some((t) => t.id === normal.id), mgrTargets);
    const mgrAll = (await api(managerToken, "GET", `${api_}/proxy-targets?scope=all`)).json as { id: string }[];
    check(`${label}：執行長 scope=all 仍看不到一般員工`, !mgrAll.some((t) => t.id === normal.id));
    const adminAll = (await api(adminToken, "GET", `${api_}/proxy-targets?scope=all`)).json as { id: string }[];
    check(`${label}：董事長 scope=all 看得到一般員工`, adminAll.some((t) => t.id === normal.id));
    check(`${label}：一般員工不能查代填對象`, (await api(normalToken, "GET", `${api_}/proxy-targets`)).status === 403);

    const mgr = await api(managerToken, "POST", api_, body(elder.id, 321));
    const mgrReport = mgr.json as Report;
    check(`${label}：執行長代填代管帳號成功`, mgr.status === 201 && mgrReport.employeeId === elder.id, mgr.json);
    check(`${label}：記錄代填者為執行長`, mgrReport.enteredBy?.name === "E2E執行長", mgrReport.enteredBy);
    check(`${label}：執行長代填一般員工被擋`, (await api(managerToken, "POST", api_, body(normal.id, 10))).status === 403);

    const cap = await api(capToken, "POST", api_, body(elder.id, 50));
    check(`${label}：具代填權限的員工可代填代管帳號`, cap.status === 201, cap.json);
    check(`${label}：具代填權限的員工不能代填一般員工`, (await api(capToken, "POST", api_, body(normal.id, 10))).status === 403);
    check(`${label}：一般員工不能代填`, (await api(normalToken, "POST", api_, body(elder.id, 10))).status === 403);

    const adm = await api(adminToken, "POST", api_, body(normal.id, 77));
    check(`${label}：董事長可代填一般員工`, adm.status === 201 && (adm.json as Report).employeeId === normal.id, adm.json);

    const own = await api(normalToken, "POST", api_, body(undefined, 20));
    check(`${label}：本人送出不記代填者`, own.status === 201 && (own.json as Report).enteredBy === null, own.json);

    const elderMine = (await api(elderToken, "GET", `${api_}/my?year=2026&month=9`)).json as Report[];
    check(`${label}：本人看得到代填的回報與代填者`, elderMine.length === 2 && elderMine.every((r) => r.enteredBy !== null), elderMine);
    const proxyList = (await api(capToken, "GET", `${api_}/proxy?employeeId=${elder.id}&year=2026&month=9`)).json as Report[];
    check(`${label}：代填者查得到對象當月回報`, Array.isArray(proxyList) && proxyList.length === 2, proxyList);
    check(
      `${label}：具權限員工不能查一般員工的回報`,
      (await api(capToken, "GET", `${api_}/proxy?employeeId=${normal.id}&year=2026&month=9`)).status === 403
    );

    const reviewList = (await api(adminToken, "GET", `${api_}?year=2026&month=9&employeeId=${elder.id}`)).json as Report[];
    check(`${label}：審核清單帶出代填者`, reviewList.some((r) => r.enteredBy?.name === "E2E代填組長"), reviewList);

    const capReport = cap.json as Report;
    check(
      `${label}：別人代填的回報不能由其他具權限員工撤回`,
      (await api(capToken, "DELETE", `${api_}/${mgrReport.id}`)).status === 403
    );
    check(`${label}：代填者可撤回自己代填的待審核回報`, (await api(capToken, "DELETE", `${api_}/${capReport.id}`)).status === 204);

    const approve = await api(adminToken, "PUT", `${api_}/${mgrReport.id}/approve`);
    check(`${label}：代填回報可正常核准`, approve.status === 200 && (approve.json as Report).status === "APPROVED", approve.json);
  }

  console.log("清理測試資料");
  const ids = (await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } })).map((u) => u.id);
  await prisma.fuelReport.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.parkingFeeReport.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.vehicle.delete({ where: { id: vehicle.id } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  check("測試帳號已清除", (await prisma.user.count({ where: { email: { in: EMAILS } } })) === 0);

  console.log(`\n結果：${passed} 通過／${failed} 失敗`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
