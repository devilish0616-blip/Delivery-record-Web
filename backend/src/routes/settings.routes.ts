import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { withAfterTaxPricing } from "../services/pricingService";

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
