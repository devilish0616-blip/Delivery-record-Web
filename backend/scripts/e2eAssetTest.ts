// 資產列管端對端實測（本機 dev 環境）
// 涵蓋：新增（一次付清／零利率分期）、驗證、帳面價值、分期進度、本月應繳帶入記帳（防重複）、
//      帳務月報資產與負債、首頁待辦、提前結清、處分、刪除後的來源警告、權限
// 用法：npx tsx scripts/e2eAssetTest.ts（需先啟動 backend dev server）
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

const pad = (n: number) => String(n).padStart(2, "0");

async function main() {
  const admin = (await api("", "POST", "/auth/login", {
    email: process.env.DEV_ADMIN_EMAIL!,
    password: process.env.DEV_ADMIN_PASSWORD!,
  })).json.token as string;
  check("董事長登入", Boolean(admin));

  const reg = await api("", "POST", "/auth/register", { email: `e2e-asset-${Date.now()}@test.local`, password: "test1234", name: "E2E資產測試員工" });
  const empId = reg.json?.user?.id as string;
  const emp = reg.json?.token as string;

  const vehicle = await prisma.vehicle.create({ data: { plateNumber: `E2A-${Date.now() % 100000}`, type: "MOTORCYCLE" } });
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const first = new Date(Date.UTC(y, m - 1 - 6, 1)); // 6 個月前開始繳
  const firstMonth = `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}`;
  const acquired = `${firstMonth}-10`;
  const createdAssetIds: string[] = [];
  let partyId = "";

  try {
    console.log("權限與驗證");
    const empList = await api(emp, "GET", "/assets");
    check("一般員工不能看資產", empList.status === 403, empList.status);

    const badLoan = await api(admin, "POST", "/assets", { name: "缺分期資料", category: "MOTORCYCLE", acquiredDate: acquired, cost: 98000, hasLoan: true });
    check("分期缺每期金額等欄位會被擋", badLoan.status === 400, badLoan.json);
    const badDown = await api(admin, "POST", "/assets", {
      name: "頭期太高", category: "MOTORCYCLE", acquiredDate: acquired, cost: 98000, hasLoan: true,
      downPayment: 98000, monthlyPayment: 1000, termCount: 10, firstPaymentMonth: firstMonth, paymentDay: 5,
    });
    check("頭期款不能大於等於總價", badDown.status === 400, badDown.json);

    console.log("新增資產");
    const cash = await api(admin, "POST", "/assets", { name: "E2E PDA × 2", category: "EQUIPMENT", acquiredDate: acquired, cost: 18000, hasLoan: false });
    check("一次付清：耐用年數與殘值自動帶入（設備 3 年、殘值 18000÷4）", cash.status === 201 && cash.json.usefulLifeYears === 3 && cash.json.salvageValue === 4500, cash.json);
    createdAssetIds.push(cash.json.id);

    const loanBody = {
      name: vehicle.plateNumber, category: "MOTORCYCLE", vehicleId: vehicle.id, acquiredDate: acquired, cost: 98000, hasLoan: true,
      downPayment: 0, lender: "E2E分期", monthlyPayment: 4083, termCount: 24, firstPaymentMonth: firstMonth, paymentDay: 28,
    };
    const loan = await api(admin, "POST", "/assets", loanBody);
    const expectedPaid = 6 + (now.getUTCDate() >= 28 ? 1 : 0);
    check("零利率分期：已繳期數依繳款日自動計算", loan.status === 201 && loan.json.loan.paidCount === expectedPaid, loan.json?.loan);
    check("最後一期自動補尾數（98000 − 4083×23）", loan.json?.loan?.lastAmount === 98000 - 4083 * 23, loan.json?.loan);
    check("還欠金額＝總價 − 已繳", loan.json?.loan?.remaining === 98000 - 4083 * expectedPaid, loan.json?.loan);
    createdAssetIds.push(loan.json.id);

    const dup = await api(admin, "POST", "/assets", { ...loanBody, name: "同一台車" });
    check("同一台車不能建兩張資產卡", dup.status === 400, dup.json);

    const list = await api(admin, "GET", "/assets");
    const mine = list.json.assets.filter((a: { id: string }) => createdAssetIds.includes(a.id));
    check("清單回傳兩筆並帶狀態", mine.length === 2 && mine.some((a: { status: string }) => a.status === "LOAN") && mine.some((a: { status: string }) => a.status === "CASH"), mine.map((a: { status: string }) => a.status));
    // 98000，2025 起 6～7 個月折舊：每月 (98000−24500)/36
    const loanItem = mine.find((a: { id: string }) => a.id === loan.json.id);
    const months = loanItem.depreciatedMonths;
    check("帳面價值＝總價 − 每月折舊 × 已攤提月數", Math.abs(loanItem.bookValue - (98000 - (73500 / 36) * months)) < 0.01, { months, bookValue: loanItem.bookValue });

    const detail = await api(admin, "GET", `/assets/${loan.json.id}`);
    check("明細含 24 期分期表", detail.json.schedule?.length === 24 && detail.json.schedule.filter((s: { paid: boolean }) => s.paid).length === expectedPaid);
    check("對應車輛的明細含持有成本", detail.json.ownership !== null && typeof detail.json.ownership.fuel === "number", detail.json.ownership);

    console.log("本月應繳帶入記帳");
    const parties = (await api(admin, "GET", "/finance/parties")).json as { id: string; isActive: boolean }[];
    partyId = parties.find((p) => p.isActive)!.id;
    const dues = await api(admin, "GET", `/assets/dues?year=${y}&month=${m}`);
    const due = dues.json.items.find((i: { assetId: string }) => i.assetId === loan.json.id);
    check("本月應繳列出第 7 期", due?.installmentNo === 7 && due?.amount === 4083 && due?.recordId === null, due);

    const todos = (await api(admin, "GET", "/home/todos")).json.todos as { key: string }[];
    check("首頁待辦提醒本月車貸還沒帶入", todos.some((t) => t.key === "loan-dues"), todos.map((t) => t.key));

    const empImport = await api(emp, "POST", "/assets/dues/import", { year: y, month: m, partyId, sourceIds: [due.sourceId] });
    check("一般員工不能帶入", empImport.status === 403, empImport.status);
    const imp = await api(admin, "POST", "/assets/dues/import", { year: y, month: m, partyId, sourceIds: [due.sourceId] });
    check("帶入記帳成功", imp.status === 201 && imp.json.created === 1, imp.json);
    const again = await api(admin, "POST", "/assets/dues/import", { year: y, month: m, partyId, sourceIds: [due.sourceId] });
    check("同一期不能帶入兩次", again.status === 409, again.json);
    const link = await prisma.financeSourceLink.findUnique({ where: { sourceType_sourceId: { sourceType: "LOAN_PAYMENT", sourceId: due.sourceId } }, include: { record: { include: { category: true } } } });
    check("記帳分類為「車貸」、金額 4083、日期為繳款日", link?.record.category?.name === "車貸" && link.record.amount === 4083 && link.record.date.toISOString().slice(0, 10) === due.dueDate, link?.record);

    const report = await api(admin, "GET", `/finance/report?year=${y}&month=${m}`);
    const a = report.json.assets;
    check("帳務月報有資產與負債", a && a.count >= 2 && a.loanPaid >= 4083, a);
    check("折舊參考損益＝淨損益＋車貸−折舊", a && Math.abs(a.depreciationBasisNet - (a.netProfit + a.loanPaid - a.depreciation)) < 0.01, a);

    console.log("提前結清、處分、刪除");
    const settle = await api(admin, "POST", `/assets/${loan.json.id}/settle`, { date: `${y}-${pad(m)}-01`, amount: 70000 });
    check("提前結清後狀態為 SETTLED、還欠 0", settle.json.status === "SETTLED" && settle.json.loan.remaining === 0, settle.json);
    const dues2 = await api(admin, "GET", `/assets/dues?year=${y}&month=${m}`);
    check("結清後本月不再列應繳", !dues2.json.items.some((i: { assetId: string }) => i.assetId === loan.json.id), dues2.json.items);
    const unsettle = await api(admin, "DELETE", `/assets/${loan.json.id}/settle`);
    check("可以取消結清", unsettle.json.status === "LOAN", unsettle.json.status);

    const dispose = await api(admin, "POST", `/assets/${cash.json.id}/dispose`, { date: `${y}-${pad(m)}-01`, amount: 5000, note: "E2E 報廢" });
    check("處分後狀態為 DISPOSED 並算出處分損益", dispose.json.status === "DISPOSED" && dispose.json.disposalGain === 5000 - dispose.json.bookValue, dispose.json);

    const del = await api(admin, "DELETE", `/assets/${loan.json.id}`);
    check("刪除資產卡", del.status === 204);
    createdAssetIds.splice(createdAssetIds.indexOf(loan.json.id), 1);
    const center = await api(admin, "GET", `/finance/import-center?year=${y}&month=${m}`);
    const warn = (center.json.warnings ?? []).find((w: { sourceType: string; recordId: string }) => w.sourceType === "LOAN_PAYMENT" && w.recordId === link?.recordId);
    check("已帶入的帳目保留，帶入中心提醒資產卡已刪除", Boolean(warn), center.json.warnings);
  } finally {
    const links = await prisma.financeSourceLink.findMany({ where: { sourceType: "LOAN_PAYMENT", sourceLabel: { startsWith: vehicle.plateNumber } } });
    await prisma.financeRecord.deleteMany({ where: { id: { in: links.map((l) => l.recordId) } } });
    await prisma.asset.deleteMany({ where: { OR: [{ id: { in: createdAssetIds } }, { vehicleId: vehicle.id }, { name: { startsWith: "E2E" } }] } });
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
