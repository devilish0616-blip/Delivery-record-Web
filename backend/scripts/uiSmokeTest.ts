// 畫面實測（Playwright）：董事長逐頁打開所有頁面與分頁，確認沒有錯誤畫面、沒有一直卡在「載入中」、瀏覽器沒有報錯；
// 另外驗證大寫 Email 登入、我的帳號頁、今日收工草稿帶回。
// 用法：先啟動 backend（npm run dev，port 4000）與 frontend（npx vite，port 5173），再執行
//   npx tsx scripts/uiSmokeTest.ts
// 結束時清除測試帳號。

import bcrypt from "bcryptjs";
// Playwright 裝在 frontend/node_modules（npm i -D playwright 後 npx playwright install chromium）
import { chromium, type Page } from "../../frontend/node_modules/playwright";
import { prisma } from "../src/lib/prisma";

const WEB = process.env.WEB_URL ?? "http://localhost:5173";
const EMP_EMAIL = "e2e-ui-employee@test.com";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

const ADMIN_PAGES = [
  "/",
  "/account",
  "/delivery?tab=today",
  "/delivery?tab=delivery",
  "/delivery?tab=mileage",
  "/requests?tab=fuel",
  "/requests?tab=parking",
  "/requests?tab=repair",
  "/requests?tab=leave",
  "/review?tab=all",
  "/review?tab=fuel",
  "/review?tab=parking",
  "/review?tab=leave",
  "/review?tab=repair",
  "/admin?tab=overview",
  "/admin?tab=weekly",
  "/admin?tab=daily",
  "/admin?tab=day",
  "/admin?tab=vehicles",
  "/admin?tab=checks",
  "/admin?tab=closing",
  "/admin/employees?tab=profile",
  "/admin/employees?tab=position",
  "/admin/employees?tab=performance",
  "/admin/vehicles",
  "/admin/assets",
  "/admin/assets?tab=dues",
  "/admin/salary?tab=calc",
  "/admin/salary?tab=preview",
  "/admin/salary?tab=grades",
  "/admin/settings?tab=general",
  "/admin/settings?tab=finance",
  "/admin/settings?tab=audit",
  "/admin/finance",
  "/admin/finance/report",
  "/admin/finance/import",
];

async function login(page: Page, email: string, password: string) {
  await page.goto(`${WEB}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "登入" }).click();
  await page.waitForURL(`${WEB}/`, { timeout: 15000 });
}

// 等到畫面上沒有「載入中」（最多 10 秒）
async function settled(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(() => !document.body.innerText.includes("載入中"), undefined, { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMP_EMAIL } });
}

async function main() {
  await cleanup();
  const browser = await chromium.launch();
  try {
    console.log("董事長逐頁打開");
    for (const viewport of [{ width: 1280, height: 860, label: "電腦" }, { width: 390, height: 844, label: "手機" }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console: ${m.text()}`);
      });
      await login(page, "LOCAL-ADMIN@test.com", "test1234");
      check(`${viewport.label}：大寫 Email 可以登入`, page.url() === `${WEB}/`);
      const bad: string[] = [];
      for (const path of ADMIN_PAGES) {
        errors.length = 0;
        await page.goto(`${WEB}${path}`);
        await page.waitForLoadState("networkidle").catch(() => {});
        const done = await settled(page);
        const text = await page.locator("body").innerText();
        if (text.includes("頁面發生錯誤")) bad.push(`${path}：錯誤畫面`);
        else if (!done) bad.push(`${path}：一直載入中`);
        else if (errors.length) bad.push(`${path}：${errors.join(" | ")}`);
      }
      check(`${viewport.label}：${ADMIN_PAGES.length} 個頁面都正常`, bad.length === 0, bad);
      await context.close();
    }

    console.log("側邊欄切換頁面（分包載入）");
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const page = await context.newPage();
      await login(page, "local-admin@test.com", "test1234");
      await page.getByRole("link", { name: "帳務月報" }).click();
      await page.waitForURL(/\/admin\/finance\/report/);
      check("點側邊欄打開帳務月報", await settled(page) && !(await page.locator("body").innerText()).includes("頁面發生錯誤"));
      await page.getByRole("link", { name: /我的帳號/ }).click();
      await page.waitForURL(/\/account/);
      const accountShown = await page
        .getByRole("heading", { name: "修改密碼" })
        .waitFor({ timeout: 10000 })
        .then(() => true, () => false);
      check("點名字打開我的帳號", accountShown);
      await context.close();
    }

    console.log("今日收工草稿");
    {
      const passwordHash = await bcrypt.hash("test1234", 10);
      await prisma.user.create({ data: { email: EMP_EMAIL, passwordHash, name: "E2E畫面員工", role: "EMPLOYEE" } });
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await login(page, EMP_EMAIL, "test1234");
      await page.goto(`${WEB}/delivery?tab=today`);
      await settled(page);
      await page.locator("#close-forward").fill("58");
      await page.locator("#close-reverse").fill("6");
      await page.waitForTimeout(300);
      await page.reload();
      await settled(page);
      check("重新整理後帶回沒送出的件數", (await page.locator("#close-forward").inputValue()) === "58" && (await page.locator("#close-reverse").inputValue()) === "6");
      check("顯示已帶回提示", await page.getByText("還沒送出的內容").isVisible());
      await page.getByRole("button", { name: "不要，改回原本的" }).click();
      check("改回原本的會清空", (await page.locator("#close-forward").inputValue()) === "");
      await page.reload();
      await settled(page);
      check("清掉後不再帶回", !(await page.getByText("還沒送出的內容").isVisible()));
      await context.close();
    }
  } finally {
    await browser.close();
    await cleanup();
  }

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
