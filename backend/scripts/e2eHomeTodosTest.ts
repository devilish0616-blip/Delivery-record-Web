// 首頁「我的待辦」與營運總覽 API 端對端實測（本機 dev 環境）
// 用法：npx tsx scripts/e2eHomeTodosTest.ts（需先啟動 backend dev server）
// 結束時會清除所有造出的測試資料。

import { prisma } from "../src/lib/prisma";
import { toDateOnlyString } from "../src/utils/date";

const BASE = "http://localhost:4000/api";

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json: json as any };
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

interface Todo {
  key: string;
  level: string;
  title: string;
  to: string;
}
const keys = (todos: Todo[]) => todos.map((t) => t.key);

async function main() {
  const admin = (await api("", "POST", "/auth/login", {
    email: process.env.DEV_ADMIN_EMAIL!,
    password: process.env.DEV_ADMIN_PASSWORD!,
  })).json.token as string;
  check("董事長登入", Boolean(admin));

  const reg = await api("", "POST", "/auth/register", {
    email: `e2e-todos-${Date.now()}@test.local`,
    password: "test1234",
    name: "E2E待辦測試員工",
  });
  const empId = reg.json?.user?.id as string;
  const emp = reg.json?.token as string;
  check("建立測試員工", reg.status === 201 && Boolean(empId), reg.json);
  const vehicle = await prisma.vehicle.create({ data: { plateNumber: `E2T-${Date.now() % 100000}`, type: "TRUCK" } });
  const today = toDateOnlyString(new Date());

  try {
    console.log("員工的待辦");
    let empTodos = (await api(emp, "GET", "/home/todos")).json.todos as Todo[];
    check("還沒填送件時出現「今天還沒填送件記錄」", keys(empTodos).includes("my-delivery"), empTodos);
    check(
      "員工看不到主管類待辦（審核、單價、薪資封存、記帳、車輛）",
      !empTodos.some((t) => ["review", "pricing", "salary-lock", "finance", "repairs", "missing-delivery"].includes(t.key) || t.key.startsWith("maint-") || t.key.startsWith("doc-")),
      keys(empTodos)
    );

    await api(emp, "POST", "/deliveries", { date: today, forwardCount: 10, reverseCount: 2 });
    await api(emp, "POST", "/fuel-reports", { date: today, amount: 400, vehicleId: vehicle.id });
    empTodos = (await api(emp, "GET", "/home/todos")).json.todos as Todo[];
    check("填完送件後該項消失", !keys(empTodos).includes("my-delivery"), keys(empTodos));
    const mine = empTodos.find((t) => t.key === "my-requests");
    check("送出申請後出現「等待主管處理」並連到我的申請", mine?.to === "/requests" && mine.title.includes("1 筆"), mine);

    console.log("主管的待辦");
    const adminTodos = (await api(admin, "GET", "/home/todos")).json.todos as Todo[];
    const review = adminTodos.find((t) => t.key === "review");
    check("董事長看到待審核並連到審核中心", review?.to === "/review", review);
    const levels = adminTodos.map((t) => t.level);
    const order = { urgent: 0, normal: 1, info: 2 } as Record<string, number>;
    check("待辦依緊急程度排序", levels.every((l, i) => i === 0 || order[levels[i - 1]] <= order[l]), levels);
    check("每一項都有連結", adminTodos.every((t) => t.to.startsWith("/")), adminTodos);

    console.log("營運總覽 API");
    const dash = await api(admin, "GET", "/dashboard");
    check("儀表板資料不再重複帶提醒（已移到待辦）", dash.status === 200 && !("alerts" in dash.json), Object.keys(dash.json ?? {}));
    check("儀表板仍提供車輛與當月統計", Array.isArray(dash.json?.vehicles) && dash.json?.month_summary !== undefined);
    const day = await api(admin, "GET", `/dashboard?date=${today}`);
    const row = day.json?.dailyStatus?.employees?.find((e: { userId: string }) => e.userId === empId);
    check("送件與派車分頁看得到測試員工已填寫", row?.hasRecord === true && row?.forwardCount === 10, row);
    const dispatch = await api(admin, "GET", `/dispatch?date=${today}`);
    check("派車資料可依日期查詢", dispatch.status === 200 && Array.isArray(dispatch.json?.vehicles), dispatch.status);
    const oldAlerts = await api(admin, "GET", "/vehicles/alerts");
    check("舊的車輛提醒 API 已移除", oldAlerts.status === 404 || oldAlerts.status === 400, oldAlerts.status);
  } finally {
    await prisma.fuelReport.deleteMany({ where: { employeeId: empId } });
    await prisma.deliveryRecord.deleteMany({ where: { userId: empId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
    await prisma.user.deleteMany({ where: { id: empId } });
  }

  console.log(`\n通過 ${passed} 項，失敗 ${failed} 項`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
