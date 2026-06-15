import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { withAfterTaxPricing } from "../services/pricingService";
import { DEFAULT_SALARY_FORMULA_CONFIG } from "../services/salaryService";

const router = Router();
router.use(requireAuth, requireAdminOrManager);

// ---------------------------------------------------------------------------
// 薪資參數設定（司機/隨車人員日薪加給）
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
  driverBonus: z.number().nonnegative(),
  attendantBonus: z.number().nonnegative(),
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
// ---------------------------------------------------------------------------

router.get(
  "/salary-formula",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const settings = await prisma.salaryFormulaSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      return res.json({ id: 1, config: DEFAULT_SALARY_FORMULA_CONFIG, updatedAt: null, updatedBy: null });
    }
    res.json(settings);
  })
);

const salaryFormulaConfigSchema = z.object({
  attendanceThresholds: z.object({
    seniorMinDays: z.number().int().nonnegative(),
    staffMinDays: z.number().int().nonnegative(),
  }),
  levelThreshold: z.object({
    highAvgThreshold: z.number().nonnegative(),
  }),
  dailyRates: z.object({
    dailyCountBreakpoint: z.number().nonnegative(),
    seniorStaffHigh: z.object({
      above: z.number().nonnegative(),
      atOrBelow: z.number().nonnegative(),
    }),
    seniorStaffLow: z.object({
      above: z.number().nonnegative(),
      atOrBelow: z.number().nonnegative(),
    }),
    temp: z.number().nonnegative(),
    special: z.number().nonnegative(),
  }),
  incentiveBonus: z.object({
    tier1Days: z.number().int().nonnegative(),
    tier1Avg: z.number().nonnegative(),
    tier1Amount: z.number().nonnegative(),
    tier2Days: z.number().int().nonnegative(),
    tier2Avg: z.number().nonnegative(),
    tier2Amount: z.number().nonnegative(),
  }),
  formulaNotes: z.string(),
});

router.put(
  "/salary-formula",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = salaryFormulaConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const config = parsed.data as Prisma.InputJsonValue;
    const settings = await prisma.salaryFormulaSettings.upsert({
      where: { id: 1 },
      update: { config, updatedBy: req.user!.id },
      create: { id: 1, config, updatedBy: req.user!.id },
    });
    res.json(settings);
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
// 每月收入單價設定
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
      return res.json(withAfterTaxPricing(pricing));
    }

    const list = await prisma.monthlyPricing.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    res.json(list.map(withAfterTaxPricing));
  })
);

const pricingSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  forwardPriceBeforeTax: z.number().nonnegative(),
  reversePriceBeforeTax: z.number().nonnegative(),
});

// 管理者每月設定一次：正/逆物流每件稅前單價（系統自動算出稅後單價）
router.post(
  "/pricing",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = pricingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, forwardPriceBeforeTax, reversePriceBeforeTax } = parsed.data;

    const pricing = await prisma.monthlyPricing.upsert({
      where: { year_month: { year, month } },
      update: { forwardPriceBeforeTax, reversePriceBeforeTax },
      create: { year, month, forwardPriceBeforeTax, reversePriceBeforeTax },
    });
    res.status(201).json(withAfterTaxPricing(pricing));
  })
);

export default router;
