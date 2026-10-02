// 今日收工＋薪資「還差多少」端對端實測：
// 一次送出角色／件數／里程／加油 → 里程不可倒退、同一台車不能填兩次 → 取消貨車會清掉貨車里程、重送不會重複加油
// → 隔天沿用上次角色與車輛、上次里程正確 → 代填後本人送出清掉代填標記
// → 薪資回傳進度欄位、首頁「再出勤 N 天」提醒
// 用法：npx tsx scripts/e2eDailyCloseTest.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料。

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api";
const EMAIL = "e2e-close-employee@test.com";
const DAY1 = "2026-08-10";
const DAY0 = "2026-08-09";
const DAY2 = "2026-08-11";

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

type Day = {
  delivery: { forwardCount: number; reverseCount: number; enteredByName: string | null } | null;
  role: string | null;
  lastRole: string | null;
  vehicles: { id: string; previousMileage: number | null }[];
  mileage: { vehicleId: string; endMileage: number }[];
  lastVehicle: { MOTORCYCLE: string | null; TRUCK: string | null };
  fuel: { amount: number; status: string }[];
};

async function main() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const passwordHash = await bcrypt.hash("test1234", 10);
  const emp = await prisma.user.create({ data: { email: EMAIL, passwordHash, name: "E2E收工員工", role: "EMPLOYEE" } });
  const stamp = Date.now() % 100000;
  const moto = await prisma.vehicle.create({ data: { plateNumber: `E2M-${stamp}`, type: "MOTORCYCLE", currentMileage: 1000 } });
  const truck = await prisma.vehicle.create({ data: { plateNumber: `E2T-${stamp}`, type: "TRUCK", currentMileage: 5000 } });
  // 前一天已有的里程（決定「上次」與不可倒退）
  await prisma.mileageRecord.create({ data: { userId: emp.id, vehicleId: moto.id, date: new Date(`${DAY0}T00:00:00Z`), endMileage: 1200 } });
  await prisma.mileageRecord.create({ data: { userId: emp.id, vehicleId: truck.id, date: new Date(`${DAY0}T00:00:00Z`), endMileage: 5300 } });

  const token = await login(EMAIL, "test1234");
  const adminToken = await login("local-admin@test.com", "test1234");

  console.log("讀取與送出");
  const empty = (await api(token, "GET", `/daily-entry?date=${DAY1}`)).json as Day;
  check("還沒填時沒有送件紀錄", empty.delivery === null && empty.role === null);
  check("上次里程為前一天的紀錄", empty.vehicles.find((v) => v.id === moto.id)?.previousMileage === 1200, empty.vehicles.filter((v) => v.id === moto.id));
  check("沿用上次的機車與貨車", empty.lastVehicle.MOTORCYCLE === moto.id && empty.lastVehicle.TRUCK === truck.id, empty.lastVehicle);
  check("日期格式錯誤被擋", (await api(token, "GET", "/daily-entry?date=2026-8-1")).status === 400);

  const full = {
    date: DAY1, role: "TRUCK_DRIVER", forwardCount: 58, reverseCount: 6, note: "E2E",
    mileage: [{ vehicleId: moto.id, endMileage: 1282 }, { vehicleId: truck.id, endMileage: 5420 }],
    fuel: { amount: 650, vehicleId: truck.id, note: "E2E加油" },
  };
  const save = await api(token, "POST", "/daily-entry", full);
  const saved = save.json as Day;
  check("一次送出成功", save.status === 200, save.json);
  check("送件與角色已存", saved.delivery?.forwardCount === 58 && saved.delivery.reverseCount === 6 && saved.role === "TRUCK_DRIVER", saved);
  check("兩台車的里程都已存", saved.mileage.length === 2, saved.mileage);
  check("加油回報建立為待審核", saved.fuel.length === 1 && saved.fuel[0].amount === 650 && saved.fuel[0].status === "PENDING", saved.fuel);
  const truckAfter = await prisma.vehicle.findUnique({ where: { id: truck.id } });
  check("車輛目前里程跟著更新", truckAfter?.currentMileage === 5420, truckAfter?.currentMileage);

  console.log("檢查規則");
  const back = await api(token, "POST", "/daily-entry", { ...full, fuel: null, mileage: [{ vehicleId: moto.id, endMileage: 1100 }] });
  check("里程比上次少被擋", back.status === 400 && String((back.json as { error: string }).error).includes("1200"), back.json);
  const twice = await api(token, "POST", "/daily-entry", { ...full, fuel: null, mileage: [{ vehicleId: moto.id, endMileage: 1300 }, { vehicleId: moto.id, endMileage: 1310 }] });
  check("同一台車填兩次被擋", twice.status === 400, twice.json);
  const negative = await api(token, "POST", "/daily-entry", { ...full, forwardCount: -1 });
  check("負數件數被擋", negative.status === 400, negative.json);
  const after400 = (await api(token, "GET", `/daily-entry?date=${DAY1}`)).json as Day;
  check("被擋的送出不會改到資料", after400.delivery?.forwardCount === 58 && after400.mileage.length === 2 && after400.fuel.length === 1, after400);

  const update = await api(token, "POST", "/daily-entry", {
    ...full, role: "NONE", forwardCount: 60, fuel: null, mileage: [{ vehicleId: moto.id, endMileage: 1290 }],
  });
  const updated = update.json as Day;
  check("更新件數成功", update.status === 200 && updated.delivery?.forwardCount === 60, update.json);
  check("取消貨車後清掉這天的貨車里程", updated.mileage.length === 1 && updated.mileage[0].vehicleId === moto.id, updated.mileage);
  check("重送沒帶加油不會重複建立", updated.fuel.length === 1, updated.fuel);

  console.log("隔天沿用");
  const next = (await api(token, "GET", `/daily-entry?date=${DAY2}`)).json as Day;
  check("隔天沿用上次角色", next.lastRole === "NONE" && next.role === null, next);
  check("隔天的上次里程是今天填的", next.vehicles.find((v) => v.id === moto.id)?.previousMileage === 1290);

  console.log("代填後本人送出");
  await api(adminToken, "PUT", `/deliveries/${emp.id}/${DAY2}`, { forwardCount: 40, reverseCount: 2, note: "E2E代填" });
  const proxied = (await api(token, "GET", `/daily-entry?date=${DAY2}`)).json as Day;
  check("看得到是誰代填", proxied.delivery?.enteredByName !== null && proxied.delivery?.forwardCount === 40, proxied.delivery);
  await api(token, "POST", "/daily-entry", { date: DAY2, role: "NONE", forwardCount: 45, reverseCount: 2, mileage: [] });
  const mine = (await api(token, "GET", `/daily-entry?date=${DAY2}`)).json as Day;
  check("本人送出後清掉代填標記", mine.delivery?.enteredByName === null && mine.delivery?.forwardCount === 45, mine.delivery);

  console.log("薪資進度與首頁提醒");
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  type Salary = { rateBreakdown: { key: string; metric?: string; current?: number; target?: number; hit: boolean }[]; incentiveTiers?: { days: number }[] };
  const s0 = (await api(token, "GET", `/salary/me?year=${year}&month=${month}`)).json as Salary;
  const tier1 = s0.rateBreakdown.find((st) => st.key === "tier1");
  check("薪資回傳出勤門檻進度", tier1?.metric === "days" && typeof tier1.target === "number" && typeof tier1.current === "number", tier1);
  check("薪資回傳激勵獎金門檻", Array.isArray(s0.incentiveTiers) && s0.incentiveTiers.length === 2, s0.incentiveTiers);

  // 讓本月出勤天數只差 2 天到第 1 階（從 1 號開始補紀錄）
  const need = (tier1?.target ?? 15) - 2;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = now.getUTCDate();
  const dates: Date[] = [];
  for (let d = 1; d <= daysInMonth && dates.length < need; d++) {
    if (d === today) continue;
    dates.push(new Date(Date.UTC(year, month - 1, d)));
  }
  await prisma.deliveryRecord.createMany({ data: dates.map((date) => ({ userId: emp.id, date, forwardCount: 50, reverseCount: 0 })) });
  const todos = ((await api(token, "GET", "/home/todos")).json as { todos: { key: string; title: string }[] }).todos;
  const goal = todos.find((t) => t.key === "salary-goal");
  check("首頁提醒再出勤 2 天", goal?.title.startsWith("再出勤 2 天") === true, todos);
  const adminTodos = ((await api(adminToken, "GET", "/home/todos")).json as { todos: { key: string }[] }).todos;
  check("董事長沒有薪資提醒", !adminTodos.some((t) => t.key === "salary-goal"));

  console.log("清理測試資料");
  await prisma.fuelReport.deleteMany({ where: { employeeId: emp.id } });
  await prisma.mileageRecord.deleteMany({ where: { vehicleId: { in: [moto.id, truck.id] } } });
  await prisma.deliveryRecord.deleteMany({ where: { userId: emp.id } });
  await prisma.dailyRoleRecord.deleteMany({ where: { userId: emp.id } });
  await prisma.vehicle.deleteMany({ where: { id: { in: [moto.id, truck.id] } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  check("測試資料已清除", (await prisma.user.count({ where: { email: EMAIL } })) === 0);

  console.log(`\n結果：${passed} 通過／${failed} 失敗`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
