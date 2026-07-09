// 記帳審核流程端對端實測：
// 建「帳務人員」職務（MANAGE_FINANCE）＋測試員工 → 員工記帳=待審核、不入報表
// → 董事長核准後入報表 → 駁回、修改重送審 → 權限邊界（改別人的帳/已核准的帳被擋）
// 用法：npx tsx scripts/e2eFinanceApprovalTest.ts（需先啟動 backend dev server）
// 結束時清除所有測試資料。

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api";

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

async function main() {
  // ── 建職務＋測試員工 ──
  const position = await prisma.jobPosition.create({
    data: { name: "E2E帳務人員", capabilities: ["MANAGE_FINANCE"] },
  });
  const clerk = await prisma.user.create({
    data: {
      email: "e2e-finance-clerk@test.com",
      passwordHash: await bcrypt.hash("test1234", 10),
      name: "E2E帳務員",
      role: "EMPLOYEE",
      jobPositionId: position.id,
    },
  });

  const adminToken = await login("local-admin@test.com", "test1234");
  const clerkToken = await login("e2e-finance-clerk@test.com", "test1234");
  check("帳務員登入", Boolean(clerkToken));

  const parties = (await api(adminToken, "GET", "/finance/parties")).json as { id: string; name: string }[];
  const categories = (await api(adminToken, "GET", "/finance/categories")).json as {
    id: string; kind: string; name: string;
  }[];
  const chen = parties.find((p) => p.name === "陳彥旭")!;
  const misc = categories.find((c) => c.kind === "EXPENSE" && c.name === "雜支")!;

  // ── 權限：帳務員可讀基本資料、不可用管理功能 ──
  console.log("權限邊界");
  check("帳務員可讀關係人清單", (await api(clerkToken, "GET", "/finance/parties")).status === 200);
  check("帳務員不可新增關係人", (await api(clerkToken, "POST", "/finance/parties", { name: "X" })).status === 403);
  check("帳務員不可看帶入中心", (await api(clerkToken, "GET", "/finance/import-center?year=2026&month=7")).status === 403);
  check("帳務員不可改帳務設定", (await api(clerkToken, "PUT", "/finance/settings", {})).status === 403);
  check("帳務員可看月報", (await api(clerkToken, "GET", "/finance/report?year=2026&month=6")).status === 200);

  // 無權限員工完全進不來
  const outsider = await prisma.user.create({
    data: {
      email: "e2e-outsider@test.com",
      passwordHash: await bcrypt.hash("test1234", 10),
      name: "E2E無權限",
      role: "EMPLOYEE",
    },
  });
  const outsiderToken = await login("e2e-outsider@test.com", "test1234");
  check("無記帳權限的員工被擋", (await api(outsiderToken, "GET", "/finance/records?year=2026&month=7")).status === 403);

  // ── 帳務員記帳 → 待審核、不入報表 ──
  console.log("待審核流程");
  const before = (await api(adminToken, "GET", "/finance/report?year=2026&month=7")).json as {
    summary: { expenseTotal: number };
  };

  const created = await api(clerkToken, "POST", "/finance/records", {
    date: "2026-07-09", type: "EXPENSE", partyId: chen.id,
    categoryId: misc.id, amount: 777, note: "E2E 審核測試",
  });
  const rec = created.json as { id: string; status: string };
  check("帳務員記帳成功且為 PENDING", created.status === 201 && rec.status === "PENDING", created.json);

  const after = (await api(adminToken, "GET", "/finance/report?year=2026&month=7")).json as {
    summary: { expenseTotal: number };
  };
  check("待審核帳目不計入報表", after.summary.expenseTotal === before.summary.expenseTotal);

  // 帳務員不能碰別人的／已核准的帳
  const someApproved = ((await api(adminToken, "GET", "/finance/records?year=2026&month=6")).json as {
    id: string; status: string;
  }[]).find((r) => r.status === "APPROVED")!;
  check(
    "帳務員不可改已核准帳目",
    (await api(clerkToken, "PUT", `/finance/records/${someApproved.id}`, {
      date: "2026-06-01", type: "EXPENSE", partyId: chen.id, categoryId: misc.id, amount: 1,
    })).status === 403
  );
  check(
    "帳務員不可刪已核准帳目",
    (await api(clerkToken, "DELETE", `/finance/records/${someApproved.id}`)).status === 403
  );
  check(
    "帳務員不可自行核准",
    (await api(clerkToken, "PUT", `/finance/records/${rec.id}/approve`)).status === 403
  );

  // ── 董事長核准 → 入報表 ──
  const approve = await api(adminToken, "PUT", `/finance/records/${rec.id}/approve`);
  check("董事長核准成功", approve.status === 200 && (approve.json as { status: string }).status === "APPROVED");
  const after2 = (await api(adminToken, "GET", "/finance/report?year=2026&month=7")).json as {
    summary: { expenseTotal: number };
  };
  check("核准後計入報表（+777）", after2.summary.expenseTotal === before.summary.expenseTotal + 777, after2.summary);

  // ── 駁回 → 修改重送審 ──
  console.log("駁回與重送審");
  const created2 = await api(clerkToken, "POST", "/finance/records", {
    date: "2026-07-09", type: "EXPENSE", partyId: chen.id,
    categoryId: misc.id, amount: 888, note: "E2E 駁回測試",
  });
  const rec2 = created2.json as { id: string };
  const rejectNoReason = await api(adminToken, "PUT", `/finance/records/${rec2.id}/reject`, {});
  check("駁回未填原因被擋", rejectNoReason.status === 400);
  const reject = await api(adminToken, "PUT", `/finance/records/${rec2.id}/reject`, {
    rejectReason: "金額有誤",
  });
  check("駁回成功", reject.status === 200 && (reject.json as { status: string }).status === "REJECTED");

  const resubmit = await api(clerkToken, "PUT", `/finance/records/${rec2.id}`, {
    date: "2026-07-09", type: "EXPENSE", partyId: chen.id,
    categoryId: misc.id, amount: 800, note: "E2E 駁回測試（改）",
  });
  const rec2b = resubmit.json as { status: string; rejectReason: string | null };
  check("帳務員修改被駁回帳目後重回待審核", resubmit.status === 200 && rec2b.status === "PENDING" && !rec2b.rejectReason, resubmit.json);

  check("帳務員可刪自己的待審核帳目", (await api(clerkToken, "DELETE", `/finance/records/${rec2.id}`)).status === 204);

  // ── 清理 ──
  console.log("清理測試資料");
  await api(adminToken, "DELETE", `/finance/records/${rec.id}`);
  await prisma.user.deleteMany({ where: { email: { in: ["e2e-finance-clerk@test.com", "e2e-outsider@test.com"] } } });
  await prisma.jobPosition.delete({ where: { id: position.id } });
  const leftover = await prisma.financeRecord.count({ where: { note: { startsWith: "E2E" } } });
  check("測試帳目已全部清除", leftover === 0, leftover);

  console.log(`\n結果：${passed} 通過／${failed} 失敗`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
