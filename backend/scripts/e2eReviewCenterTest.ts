// 審核中心／我的申請端對端實測（本機 dev 環境）
// 涵蓋：加油與停車費共用路由、審核中心待處理件數、核准／駁回／撤回、權限（員工看不到別人的回報與件數）
// 用法：npx tsx scripts/e2eReviewCenterTest.ts（需先啟動 backend dev server）
// 結束時會清除所有造出的測試資料。

import { prisma } from "../src/lib/prisma";

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

interface Summary {
  fuel: number | null;
  parking: number | null;
  leave: number | null;
  repair: number | null;
}

async function main() {
  const admin = (await api("", "POST", "/auth/login", {
    email: process.env.DEV_ADMIN_EMAIL!,
    password: process.env.DEV_ADMIN_PASSWORD!,
  })).json.token as string;
  check("董事長登入", Boolean(admin));

  const testEmail = `e2e-review-${Date.now()}@test.local`;
  const reg = await api("", "POST", "/auth/register", { email: testEmail, password: "test1234", name: "E2E審核測試員工" });
  const empId = reg.json?.user?.id as string;
  const emp = reg.json?.token as string;
  check("建立測試員工", reg.status === 201 && Boolean(empId), reg.json);

  const vehicle = await prisma.vehicle.create({ data: { plateNumber: `E2E-${Date.now() % 100000}`, type: "TRUCK" } });

  try {
    const before = (await api(admin, "GET", "/review/summary")).json as Summary;
    check("董事長取得各類待處理件數", [before.fuel, before.parking, before.leave, before.repair].every((n) => typeof n === "number"), before);

    const empSummary = (await api(emp, "GET", "/review/summary")).json as Summary;
    check("一般員工沒有審核權限，各類件數皆為 null", Object.values(empSummary).every((v) => v === null), empSummary);

    console.log("我的申請：送出四種單子");
    const today = new Date().toISOString().slice(0, 10);
    const fuel = await api(emp, "POST", "/fuel-reports", { date: today, amount: 500, vehicleId: vehicle.id });
    const fuel2 = await api(emp, "POST", "/fuel-reports", { date: today, amount: 300, vehicleId: vehicle.id });
    const parking = await api(emp, "POST", "/parking-fee-reports", { date: today, amount: 80, note: "E2E", vehicleId: vehicle.id });
    const leave = await api(emp, "POST", "/leaves", { date: today, reason: "E2E" });
    const repair = await api(emp, "POST", "/repair-requests", { vehicleId: vehicle.id, description: "E2E 煞車異音" });
    check("送出加油回報（共用路由）", fuel.status === 201 && fuel.json.employee?.id === empId, fuel.json);
    check("送出停車費回報（共用路由）", parking.status === 201 && parking.json.vehicle?.id === vehicle.id, parking.json);
    check("送出請假與報修", leave.status === 201 && repair.status === 201, { leave: leave.json, repair: repair.json });

    const bad = await api(emp, "POST", "/parking-fee-reports", { date: today, amount: 0, vehicleId: vehicle.id });
    check("金額為 0 被拒絕", bad.status === 400, bad.json);

    const mine = await api(emp, "GET", "/fuel-reports/my");
    check("員工查到自己的加油回報", mine.status === 200 && mine.json.length === 2, mine.json);
    const forbidden = await api(emp, "GET", "/parking-fee-reports");
    check("員工不能查全部停車費回報", forbidden.status === 403, forbidden.json);

    const after = (await api(admin, "GET", "/review/summary")).json as Summary;
    check(
      "待處理件數依新單子增加",
      after.fuel === before.fuel! + 2 && after.parking === before.parking! + 1 && after.leave === before.leave! + 1 && after.repair === before.repair! + 1,
      { before, after }
    );

    console.log("審核中心：核准、駁回、撤回");
    const approve = await api(admin, "PUT", `/fuel-reports/${fuel.json.id}/approve`);
    check("核准加油回報", approve.status === 200 && approve.json.status === "APPROVED", approve.json);
    const again = await api(admin, "PUT", `/fuel-reports/${fuel.json.id}/approve`);
    check("已審核的回報不能再審", again.status === 400, again.json);
    const noReason = await api(admin, "PUT", `/parking-fee-reports/${parking.json.id}/reject`, {});
    check("駁回停車費需填原因", noReason.status === 400, noReason.json);
    const reject = await api(admin, "PUT", `/parking-fee-reports/${parking.json.id}/reject`, { rejectReason: "E2E 無收據" });
    check("駁回停車費回報", reject.status === 200 && reject.json.rejectReason === "E2E 無收據", reject.json);
    const withdrawApproved = await api(emp, "DELETE", `/fuel-reports/${fuel.json.id}`);
    check("員工不能撤回已核准的回報", withdrawApproved.status === 400, withdrawApproved.json);
    const withdraw = await api(emp, "DELETE", `/fuel-reports/${fuel2.json.id}`);
    check("員工撤回待審核的回報", withdraw.status === 204);
    const leaveOk = await api(admin, "PATCH", `/leaves/${leave.json.id}/approve`);
    check("核准請假", leaveOk.status === 200 && leaveOk.json.status === "APPROVED", leaveOk.json);

    const final = (await api(admin, "GET", "/review/summary")).json as Summary;
    check(
      "處理完後待處理件數回到原本（報修仍待處理）",
      final.fuel === before.fuel && final.parking === before.parking && final.leave === before.leave && final.repair === before.repair! + 1,
      { before, final }
    );

    const salary = await api(admin, "GET", `/salary/${empId}?year=${today.slice(0, 4)}&month=${Number(today.slice(5, 7))}`);
    check("核准的油資計入薪資補貼", salary.status === 200 && salary.json.fuelAllowance === 500, salary.json?.fuelAllowance);
  } finally {
    await prisma.fuelReport.deleteMany({ where: { employeeId: empId } });
    await prisma.parkingFeeReport.deleteMany({ where: { employeeId: empId } });
    await prisma.leaveRequest.deleteMany({ where: { userId: empId } });
    await prisma.repairRequest.deleteMany({ where: { reportedById: empId } });
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
