// 職等／網頁使用權限／職務複選功能端對端實測（本機 dev 環境）
// 用法：npx tsx scripts/e2ePayGradeTest.ts（需先啟動 backend dev server）
// 結束時會清除所有造出的測試資料。

import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api";
let TOKEN = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
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

async function main() {
  // ── 登入保底開發者帳號 ──
  const email = process.env.DEV_ADMIN_EMAIL!;
  const password = process.env.DEV_ADMIN_PASSWORD!;
  const login = await api("POST", "/auth/login", { email, password });
  TOKEN = (login.json as { token: string })?.token;
  check("保底開發者帳號登入", Boolean(TOKEN), login.json);

  const me = (await api("GET", "/auth/me")).json as { id: string; role: string };
  check("/auth/me 回傳 ADMIN 角色", me.role === "ADMIN", me);

  // ── 建立測試員工 ──
  const testEmail = `e2e-paygrade-${Date.now()}@test.local`;
  const registered = await api("POST", "/auth/register", {
    email: testEmail,
    password: "test1234",
    name: "E2E測試員工",
  });
  const testUserId = (registered.json as { user: { id: string } })?.user?.id;
  check("建立測試員工", registered.status === 201 && Boolean(testUserId), registered.json);

  try {
    // ── 職等 CRUD ──
    console.log("職等 CRUD");
    const gradesBefore = (await api("GET", "/pay-grades")).json as { id: string; isDefault: boolean }[];
    const defaultGrade = gradesBefore.find((g) => g.isDefault);
    check("存在預設職等", Boolean(defaultGrade), gradesBefore);

    const created = await api("POST", "/pay-grades", {
      name: "E2E測試職等",
      config: {
        pieceRate: {
          basePrice: 999, // 刻意設一個特殊值，用來驗證此職等確實套用到指派的員工
          attendanceBonus: { tier1Days: 15, tier1Bonus: 1, tier2Days: 20, tier2Bonus: 0.5, tier3Days: 25, tier3Bonus: 0.5 },
          averageCountBonus: { threshold: 60, bonus: 1 },
          totalCountBonus: { threshold: 2000, bonus: 1 },
        },
        incentiveBonus: { tier1Days: 25, tier1Avg: 60, tier1Amount: 3000, tier2Days: 25, tier2Avg: 30, tier2Amount: 1500 },
        formulaNotes: "E2E 測試職等",
      },
    });
    const gradeId = (created.json as { id: string })?.id;
    check("新增職等", created.status === 201 && Boolean(gradeId), created.json);

    // ── 指派職等給測試員工，驗證薪資試算套用該職等公式 ──
    const assignGrade = await api("PATCH", `/employees/${testUserId}/pay-grade`, { payGradeId: gradeId });
    check("指派職等給員工", assignGrade.status === 200, assignGrade.json);

    // 造一筆送件紀錄，讓該員工當月出勤 1 天（未達任何加給門檻），驗證單價套用剛設定的原始單價 999
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await prisma.deliveryRecord.create({
      data: { userId: testUserId, date: new Date(`${dateStr}T00:00:00Z`), forwardCount: 5, reverseCount: 0 },
    });
    async function fetchTestUserSalary() {
      const res = (await api("GET", `/salary?year=${year}&month=${month}`)).json as {
        salaries: { userId: string; pieceWorkTotal: number; jobAllowance: number }[];
      };
      return res.salaries.find((s) => s.userId === testUserId);
    }
    const salary = await fetchTestUserSalary();
    check(
      "薪資試算套用指派職等的單價（原始單價 999 → 5*999=4995）",
      salary?.pieceWorkTotal === 4995,
      salary
    );

    // ── 職務複選 ──
    console.log("職務複選");
    const posA = await api("POST", "/job-positions", { name: "E2E職務A", allowance: 1000, capabilities: ["MANAGE_VEHICLES"] });
    const posB = await api("POST", "/job-positions", { name: "E2E職務B", allowance: 2000, capabilities: ["PROXY_DELIVERY"] });
    const posAId = (posA.json as { id: string })?.id;
    const posBId = (posB.json as { id: string })?.id;
    check("新增職務 A/B", posA.status === 201 && posB.status === 201);

    await api("POST", `/employees/${testUserId}/job-positions/${posAId}`, { since: null });
    await api("POST", `/employees/${testUserId}/job-positions/${posBId}`, { since: null });

    const employees = (await api("GET", "/employees")).json as {
      id: string;
      jobPositions: { id: string; allowance: number }[];
      capabilities: string[];
    }[];
    const testUser = employees.find((u) => u.id === testUserId)!;
    check("員工同時擁有兩個職務", testUser?.jobPositions?.length === 2, testUser?.jobPositions);
    check(
      "職務衍生權限聯集（車輛管理＋代填送件）",
      testUser?.capabilities?.includes("MANAGE_VEHICLES") && testUser?.capabilities?.includes("PROXY_DELIVERY"),
      testUser?.capabilities
    );

    const salaryAfterPositions = await fetchTestUserSalary();
    check("職務加給加總（1000+2000=3000）", salaryAfterPositions?.jobAllowance === 3000, salaryAfterPositions);

    // 移除一個職務，驗證加給與權限跟著減少
    await api("DELETE", `/employees/${testUserId}/job-positions/${posAId}`);
    const employees2 = (await api("GET", "/employees")).json as {
      id: string;
      jobPositions: { id: string }[];
      capabilities: string[];
    }[];
    const testUser2 = employees2.find((u) => u.id === testUserId)!;
    check("移除一筆職務後僅剩一筆", testUser2?.jobPositions?.length === 1, testUser2?.jobPositions);
    check("移除後不再擁有該職務的權限", !testUser2?.capabilities?.includes("MANAGE_VEHICLES"), testUser2?.capabilities);

    // ── 直接授予網頁使用權限（不透過職務）──
    console.log("網頁使用權限");
    const capRes = await api("PATCH", `/employees/${testUserId}/capabilities`, { capabilities: ["MANAGE_FINANCE"] });
    check("直接授予 MANAGE_FINANCE", capRes.status === 200, capRes.json);
    const employees3 = (await api("GET", "/employees")).json as { id: string; capabilities: string[] }[];
    const testUser3 = employees3.find((u) => u.id === testUserId)!;
    check(
      "實際生效權限為職務(代填送件)＋直接授予(記帳)聯集",
      testUser3?.capabilities?.includes("PROXY_DELIVERY") && testUser3?.capabilities?.includes("MANAGE_FINANCE"),
      testUser3?.capabilities
    );

    // ── 最後一位管理者防呆 ──
    console.log("最後管理者防呆");
    const adminCountBefore = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    if (adminCountBefore === 1) {
      const meId = me.id;
      const demote = await api("PATCH", `/employees/${meId}/role`, { role: "EMPLOYEE" });
      check("唯一 ADMIN 無法被降級", demote.status === 400, demote.json);
      const deactivate = await api("PATCH", `/employees/${meId}/status`, { isActive: false });
      check("唯一 ADMIN 無法被停用", deactivate.status === 400, deactivate.json);
    } else {
      console.log(`  (略過：目前有 ${adminCountBefore} 位啟用中管理者，非唯一)`);
    }

    // ── 職等刪除防呆 ──
    console.log("職等防呆");
    const deleteDefault = await api("DELETE", `/pay-grades/${defaultGrade!.id}`);
    check("預設職等無法被刪除", deleteDefault.status === 400, deleteDefault.json);

    // 清掉測試員工的職等，讓自訂職等可刪
    await api("PATCH", `/employees/${testUserId}/pay-grade`, { payGradeId: null });
    const deleteGrade = await api("DELETE", `/pay-grades/${gradeId}`);
    check("已解除指派的自訂職等可正常刪除", deleteGrade.status === 204, deleteGrade.json);

    // ── 清理職務 ──
    await api("DELETE", `/employees/${testUserId}/job-positions/${posBId}`);
    await api("DELETE", `/job-positions/${posAId}`);
    await api("DELETE", `/job-positions/${posBId}`);
  } finally {
    // ── 清理測試資料 ──
    await prisma.deliveryRecord.deleteMany({ where: { userId: testUserId } });
    await prisma.userJobPosition.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
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
