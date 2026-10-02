// 操作紀錄＋月底結算＋車貸「已另外記帳」端對端實測：
// 管理者改件數、本人改自己的件數、代填報帳與審核、扣款、單價、角色與權限、記帳增改刪 → 都有紀錄且改前改後正確；
// 本人第一次填寫不記 → 篩選（分類、員工、關鍵字、日期）與分頁 → 只有董事長看得到
// → 車貸標記已另外記帳後不再算未帶入、不能帶入、首頁不提醒、可還原 → 月底結算清單的車貸步驟跟著變
// 用法：npx tsx scripts/e2eAuditClosingTest.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料（操作紀錄中與測試帳號有關的也一併清除）。

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api";
const EMAILS = ["e2e-audit-employee@test.com", "e2e-audit-manager@test.com"];
const TEST_YEAR = 2020;
const TEST_MONTH = 1;

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

type Log = {
  id: string;
  category: string;
  action: string;
  summary: string;
  actorName: string;
  targetUserId: string | null;
  targetName: string | null;
  changes: { label: string; from: unknown; to: unknown }[] | null;
};
type Page = { items: Log[]; nextCursor: string | null };

const startedAt = new Date();
let empId = "";
let assetId = "";
let vehicleId = "";
const financeIds: string[] = [];

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.fuelReport.deleteMany({ where: { OR: [{ employeeId: { in: ids } }, ...(vehicleId ? [{ vehicleId }] : [])] } });
  await prisma.deliveryRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.dailyRoleRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.salaryDeduction.deleteMany({ where: { userId: { in: ids } } });
  await prisma.salarySnapshot.deleteMany({ where: { year: TEST_YEAR, month: TEST_MONTH } });
  await prisma.salaryMonthLock.deleteMany({ where: { year: TEST_YEAR, month: TEST_MONTH } });
  await prisma.monthlyPricing.deleteMany({ where: { year: TEST_YEAR, month: TEST_MONTH } });
  if (financeIds.length) await prisma.financeRecord.deleteMany({ where: { id: { in: financeIds } } });
  if (assetId) {
    await prisma.financeIgnoredSource.deleteMany({ where: { sourceType: "LOAN_PAYMENT", sourceId: { startsWith: `${assetId}:` } } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
  }
  // 測試期間產生的操作紀錄全部清掉（本機測試資料庫）＋與測試帳號有關的
  await prisma.auditLog.deleteMany({
    where: { OR: [{ createdAt: { gte: startedAt } }, { targetUserId: { in: ids } }, { actorId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
}

async function main() {
  await cleanup();
  const passwordHash = await bcrypt.hash("test1234", 10);
  const emp = await prisma.user.create({ data: { email: EMAILS[0], passwordHash, name: "E2E紀錄員工", role: "EMPLOYEE", isProxyManaged: true } });
  empId = emp.id;
  await prisma.user.create({ data: { email: EMAILS[1], passwordHash, name: "E2E紀錄執行長", role: "MANAGER" } });
  const vehicle = await prisma.vehicle.create({ data: { plateNumber: `E2L-${Date.now() % 100000}`, type: "MOTORCYCLE" } });
  vehicleId = vehicle.id;

  const admin = await login("local-admin@test.com", "test1234");
  const manager = await login(EMAILS[1], "test1234");
  const empToken = await login(EMAILS[0], "test1234");

  const logsFor = async (q = "") => ((await api(admin, "GET", `/audit-logs?userId=${emp.id}${q}`)).json as Page).items;

  console.log("送件");
  await api(empToken, "POST", "/deliveries", { date: "2026-08-03", forwardCount: 50, reverseCount: 5 });
  check("本人第一次填寫不記", (await logsFor()).length === 0);
  await api(empToken, "POST", "/deliveries", { date: "2026-08-03", forwardCount: 52, reverseCount: 5 });
  const selfEdit = (await logsFor()).find((l) => l.summary.includes("本人修改"));
  check("本人改自己的件數有記錄", !!selfEdit && selfEdit.changes?.[0]?.label === "正物流" && selfEdit.changes[0].from === 50 && selfEdit.changes[0].to === 52, selfEdit);
  await api(admin, "PUT", `/deliveries/${emp.id}/2026-08-03`, { forwardCount: 520, reverseCount: 5, note: null });
  const adminEdit = (await logsFor()).find((l) => l.summary.includes("管理者修正"));
  check("管理者修正件數有改前改後", !!adminEdit && adminEdit.actorName === "本機測試管理員" && adminEdit.targetName === "E2E紀錄員工" && adminEdit.changes?.[0]?.to === 520, adminEdit);
  await api(manager, "POST", "/deliveries/proxy", { date: "2026-08-04", entries: [{ userId: emp.id, role: "TRUCK_ATTENDANT", forwardCount: 40, reverseCount: 2 }] });
  const proxy = (await logsFor()).find((l) => l.summary.includes("代填送件"));
  check("代填送件記錄代填者與角色", !!proxy && proxy.actorName === "E2E紀錄執行長" && proxy.action === "CREATE" && proxy.changes?.some((c) => c.label === "今日角色" && c.to === "隨車") === true, proxy);
  await api(admin, "DELETE", `/deliveries/${emp.id}/2026-08-04`);
  check("刪除送件有記錄", (await logsFor()).some((l) => l.action === "DELETE" && l.summary.includes("8/4")));

  console.log("審核");
  const fuel = await api(manager, "POST", "/fuel-reports", { date: "2026-08-03", amount: 345, vehicleId: vehicle.id, employeeId: emp.id });
  const fuelId = (fuel.json as { id: string }).id;
  check("代填加油有記錄", (await logsFor()).some((l) => l.category === "REVIEW" && l.summary.includes("代填加油回報")));
  await api(admin, "PUT", `/fuel-reports/${fuelId}/approve`);
  check("核准油資有記錄", (await logsFor()).some((l) => l.action === "APPROVE" && l.summary.includes("$345")));
  const fuel2 = await api(manager, "POST", "/fuel-reports", { date: "2026-08-04", amount: 99, vehicleId: vehicle.id, employeeId: emp.id });
  await api(manager, "PUT", `/fuel-reports/${(fuel2.json as { id: string }).id}/reject`, { rejectReason: "E2E收據不清楚" });
  check("駁回含原因", (await logsFor()).some((l) => l.action === "REJECT" && l.summary.includes("E2E收據不清楚")));

  console.log("薪資與設定");
  const ded = await api(admin, "POST", "/salary/deductions", { userId: emp.id, year: TEST_YEAR, month: TEST_MONTH, amount: 300, reason: "E2E扣款" });
  await api(admin, "DELETE", `/salary/deductions/${(ded.json as { id: string }).id}`);
  const dedLogs = (await logsFor()).filter((l) => l.category === "SALARY");
  check("扣款新增與刪除都有記錄", dedLogs.some((l) => l.action === "CREATE") && dedLogs.some((l) => l.action === "DELETE"), dedLogs);
  await api(admin, "POST", "/salary/lock", { year: TEST_YEAR, month: TEST_MONTH });
  await api(admin, "POST", "/salary/unlock", { year: TEST_YEAR, month: TEST_MONTH });
  const lockLogs = ((await api(admin, "GET", "/audit-logs?category=SALARY&q=2020")).json as Page).items;
  check("封存與解封有記錄", lockLogs.some((l) => l.action === "LOCK") && lockLogs.some((l) => l.action === "UNLOCK"), lockLogs.map((l) => l.summary));
  await api(admin, "POST", "/settings/pricing", { year: TEST_YEAR, month: TEST_MONTH, forwardPrice: 30, reversePrice: 25 });
  await api(admin, "POST", "/settings/pricing", { year: TEST_YEAR, month: TEST_MONTH, forwardPrice: 31, reversePrice: 25 });
  const priceLogs = ((await api(admin, "GET", "/audit-logs?category=SETTINGS&q=2020")).json as Page).items;
  const priceUpdate = priceLogs.find((l) => l.action === "UPDATE");
  check("修改單價只記有變的欄位", !!priceUpdate && priceUpdate.changes?.length === 1 && priceUpdate.changes[0].from === 30 && priceUpdate.changes[0].to === 31, priceLogs);

  console.log("員工與權限");
  await api(admin, "PATCH", `/employees/${emp.id}/role`, { role: "MANAGER" });
  await api(admin, "PATCH", `/employees/${emp.id}/role`, { role: "EMPLOYEE" });
  await api(admin, "PATCH", `/employees/${emp.id}/capabilities`, { capabilities: ["PROXY_DELIVERY"] });
  const empLogs = (await logsFor("&category=EMPLOYEE")).map((l) => l.changes?.[0]);
  check("角色變更顯示中文", empLogs.some((c) => c?.label === "角色" && c.from === "員工" && c.to === "執行長"), empLogs);
  check("權限變更顯示中文", empLogs.some((c) => c?.label === "直接授予的權限" && c.to === "代填送件"), empLogs);

  console.log("記帳");
  const categories = (await api(admin, "GET", "/finance/categories")).json as { id: string; kind: string; isActive?: boolean }[];
  const parties = (await api(admin, "GET", "/finance/parties")).json as { id: string; isActive?: boolean }[];
  const expenseCat = categories.find((c) => c.kind === "EXPENSE");
  if (expenseCat && parties[0]) {
    const rec = await api(admin, "POST", "/finance/records", { date: "2026-08-05", type: "EXPENSE", partyId: parties[0].id, categoryId: expenseCat.id, amount: 1234, note: "E2E記帳" });
    const recId = (rec.json as { id: string }).id;
    financeIds.push(recId);
    await api(admin, "PUT", `/finance/records/${recId}`, { date: "2026-08-05", type: "EXPENSE", partyId: parties[0].id, categoryId: expenseCat.id, amount: 1500, note: "E2E記帳" });
    await api(admin, "DELETE", `/finance/records/${recId}`);
    const fin = ((await api(admin, "GET", "/audit-logs?category=FINANCE&q=1,500")).json as Page).items;
    check("帳目修改記下金額改前改後", fin.some((l) => l.action === "UPDATE" && l.changes?.some((c) => c.label === "金額" && c.from === 1234 && c.to === 1500)), fin);
    check("帳目刪除有記錄", fin.some((l) => l.action === "DELETE"), fin.map((l) => l.summary));
  } else {
    check("本機有記帳分類與關係人可測", false);
  }

  console.log("查詢與權限");
  const page1 = (await api(admin, "GET", `/audit-logs?userId=${emp.id}&limit=2`)).json as Page;
  const page2 = (await api(admin, "GET", `/audit-logs?userId=${emp.id}&limit=2&cursor=${page1.nextCursor}`)).json as Page;
  check("分頁不重複", page1.items.length === 2 && !!page1.nextCursor && page2.items.length > 0 && !page2.items.some((l) => page1.items.some((p) => p.id === l.id)));
  const today = new Date();
  const tw = new Date(today.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  check("日期篩選含今天", (await logsFor(`&from=${tw}&to=${tw}`)).length > 0);
  check("日期篩選排除別天", (await logsFor("&from=2020-01-01&to=2020-01-02")).length === 0);
  check("執行長不能看操作紀錄", (await api(manager, "GET", "/audit-logs")).status === 403);
  check("分類錯誤被擋", (await api(admin, "GET", "/audit-logs?category=XYZ")).status === 400);

  console.log("車貸已另外記帳＋月底結算");
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const first = new Date(Date.UTC(y, m - 3, 1));
  const firstMonth = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`;
  const created = await api(admin, "POST", "/assets", {
    name: "E2E車貸測試", category: "EQUIPMENT", acquiredDate: `${firstMonth}-01`, cost: 36000, hasLoan: true, downPayment: 0,
    monthlyPayment: 3000, termCount: 12, firstPaymentMonth: firstMonth, paymentDay: 1,
  });
  assetId = (created.json as { id: string }).id;
  check("建立分期資產", created.status === 201, created.json);
  type Dues = { items: { sourceId: string; assetName: string; ignored: boolean; recordId: string | null }[] };
  const dues = (await api(admin, "GET", `/assets/dues?year=${y}&month=${m}`)).json as Dues;
  const mine = dues.items.find((i) => i.assetName === "E2E車貸測試");
  check("本月應繳列出這期且未標記", !!mine && mine.ignored === false, dues.items);
  const closingBefore = (await api(admin, "GET", `/closing?year=${y}&month=${m}`)).json as { steps: { key: string; status: string; detail: string }[] };
  const loanBefore = closingBefore.steps.find((s) => s.key === "loan");
  check("月底結算：車貸未帶入為要處理", loanBefore?.status === "todo", loanBefore);
  check("月底結算有七個步驟", ["pricing", "checks", "review", "salary", "loan", "import", "finance"].every((k) => closingBefore.steps.some((s) => s.key === k)), closingBefore.steps.map((s) => s.key));

  const todosBefore = ((await api(admin, "GET", "/home/todos")).json as { todos: { key: string; title: string }[] }).todos.find((t) => t.key === "loan-dues");
  await api(admin, "POST", "/finance/import-center/ignore", { sourceType: "LOAN_PAYMENT", sourceId: mine!.sourceId, reason: "已另外記帳" });
  const after = ((await api(admin, "GET", `/assets/dues?year=${y}&month=${m}`)).json as Dues).items.find((i) => i.sourceId === mine!.sourceId);
  check("標記後顯示已另外記帳", after?.ignored === true, after);
  const blockedImport = await api(admin, "POST", "/assets/dues/import", { year: y, month: m, sourceIds: [mine!.sourceId], partyId: parties[0]?.id });
  check("已另外記帳的期數不能帶入", blockedImport.status === 409, blockedImport.json);
  const todosAfter = ((await api(admin, "GET", "/home/todos")).json as { todos: { key: string; title: string }[] }).todos.find((t) => t.key === "loan-dues");
  const left = (t?: { title: string }) => Number(t?.title.match(/(\d+) 筆/)?.[1] ?? 0);
  check("首頁車貸提醒少一筆", left(todosAfter) === left(todosBefore) - 1, [todosBefore?.title, todosAfter?.title]);
  const closingAfter = (await api(admin, "GET", `/closing?year=${y}&month=${m}`)).json as { steps: { key: string; status: string }[] };
  check("月底結算：車貸步驟完成", closingAfter.steps.find((s) => s.key === "loan")?.status === "done", closingAfter.steps);
  check("標記不帶入有操作紀錄", ((await api(admin, "GET", "/audit-logs?category=FINANCE&q=車貸")).json as Page).items.some((l) => l.summary.includes("不帶入")));
  await api(admin, "DELETE", `/finance/import-center/ignore/LOAN_PAYMENT/${encodeURIComponent(mine!.sourceId)}`);
  const restored = ((await api(admin, "GET", `/assets/dues?year=${y}&month=${m}`)).json as Dues).items.find((i) => i.sourceId === mine!.sourceId);
  check("還原後回到未帶入", restored?.ignored === false);
  check("執行長不能看月底結算", (await api(manager, "GET", "/closing")).status === 403);
  const defaultClosing = (await api(admin, "GET", "/closing")).json as { year: number; month: number };
  const prev = new Date(Date.UTC(y, m - 2, 1));
  check("月底結算預設上個月", defaultClosing.year === prev.getUTCFullYear() && defaultClosing.month === prev.getUTCMonth() + 1, defaultClosing);

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
