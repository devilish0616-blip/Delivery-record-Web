import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { DEFAULT_SALARY_FORMULA_CONFIG } from "../services/salaryService";
import { salaryFormulaConfigSchema } from "../validation/salaryFormula";

const router = Router();
router.use(requireAuth, requireAdminOrManager);

// ---------------------------------------------------------------------------
// 系統參數（薪資封存提醒日、註冊開關）；司機／隨車日加給已移至各職等設定
// ---------------------------------------------------------------------------

router.get(
  "/salary",
  asyncHandler(async (_req, res) => {
    const settings = await prisma.salarySettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    res.json(settings);
  })
);

const salarySettingsSchema = z.object({
  salaryLockGraceDay: z.number().int().min(1).max(28),
});

router.put(
  "/salary",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = salarySettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const settings = await prisma.salarySettings.upsert({
      where: { id: 1 },
      update: parsed.data,
      create: { id: 1, ...parsed.data },
    });
    res.json(settings);
  })
);

// ---------------------------------------------------------------------------
// 薪資計算公式設定（僅 ADMIN 可查看與修改）
// 已改為「預設職等」的公式（職等模組上線後，各職等可各自設定不同公式，
// 此處僅維持舊路徑相容，實際讀寫的是 PayGrade(isDefault: true) 那一筆；
// 完整的職等管理請至「職等薪資設定」頁）
// ---------------------------------------------------------------------------

router.get(
  "/salary-formula",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const defaultGrade = await prisma.payGrade.findFirst({ where: { isDefault: true } });
    if (!defaultGrade) {
      return res.json({ id: null, config: DEFAULT_SALARY_FORMULA_CONFIG, updatedAt: null, updatedBy: null });
    }
    res.json(defaultGrade);
  })
);

router.put(
  "/salary-formula",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = salaryFormulaConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const config = parsed.data as Prisma.InputJsonValue;
    const defaultGrade = await prisma.payGrade.findFirst({ where: { isDefault: true } });
    if (!defaultGrade) {
      return res.status(500).json({ error: "找不到預設職等，請至「職等薪資設定」頁確認" });
    }
    const updated = await prisma.payGrade.update({
      where: { id: defaultGrade.id },
      data: { config, updatedBy: req.user!.id },
    });
    res.json(updated);
  })
);

// ---------------------------------------------------------------------------
// 員工註冊開關
// ---------------------------------------------------------------------------

const registrationSettingsSchema = z.object({
  registrationEnabled: z.boolean(),
});

router.put(
  "/registration",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = registrationSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const settings = await prisma.salarySettings.upsert({
      where: { id: 1 },
      update: parsed.data,
      create: { id: 1, ...parsed.data },
    });
    res.json(settings);
  })
);

// ---------------------------------------------------------------------------
// 每月收入單價設定：直接輸入公司每件「實拿」金額（正／逆物流各一），不做稅前／稅後換算
// ---------------------------------------------------------------------------

router.get(
  "/pricing",
  asyncHandler(async (req, res) => {
    const { year, month } = req.query as Record<string, string | undefined>;

    if (year && month) {
      const pricing = await prisma.monthlyPricing.findUnique({
        where: { year_month: { year: Number(year), month: Number(month) } },
      });
      if (!pricing) {
        return res.status(404).json({ error: "尚未設定此月份的單價" });
      }
      return res.json(pricing);
    }

    const list = await prisma.monthlyPricing.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    res.json(list);
  })
);

const pricingSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  forwardPrice: z.number().nonnegative("單價不可為負數"),
  reversePrice: z.number().nonnegative("單價不可為負數"),
});

// 新增或覆蓋某月份的正／逆物流實拿單價
router.post(
  "/pricing",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = pricingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, forwardPrice, reversePrice } = parsed.data;

    const pricing = await prisma.monthlyPricing.upsert({
      where: { year_month: { year, month } },
      update: { forwardPrice, reversePrice },
      create: { year, month, forwardPrice, reversePrice },
    });
    res.status(201).json(pricing);
  })
);

// 刪除某月份單價（例如建錯月份）；刪除後該月儀表板與帳務月報的預估營收顯示為未設定
router.delete(
  "/pricing/:year/:month",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.monthlyPricing.deleteMany({
      where: { year: Number(req.params.year), month: Number(req.params.month) },
    });
    res.status(204).end();
  })
);

export default router;
