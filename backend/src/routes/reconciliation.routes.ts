import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseSupplierSummarySheet } from "../services/reconciliationService";
import { startOfMonth, startOfNextMonth } from "../utils/date";

const router = Router();
router.use(requireAuth, requireAdminOrManager);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("僅支援 Excel 檔案 (.xlsx, .xls)"));
    }
    cb(null, true);
  },
});

// 模組四：上傳貨運行月結 Excel（總表工作表），解析並建立對帳結果
router.post(
  "/upload",
  requireAdmin,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "請上傳 Excel 檔案" });
    }
    const year = Number(req.body.year);
    const month = Number(req.body.month);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: "請提供有效的 year 與 month" });
    }

    let parsed;
    try {
      parsed = await parseSupplierSummarySheet(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const monthStart = startOfMonth(year, month);
    const monthEnd = startOfNextMonth(year, month);
    const deliveryRecords = await prisma.deliveryRecord.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      select: { forwardCount: true, reverseCount: true },
    });
    const systemTotals = deliveryRecords.reduce(
      (acc, r) => {
        acc.forwardCount += r.forwardCount;
        acc.reverseCount += r.reverseCount;
        return acc;
      },
      { forwardCount: 0, reverseCount: 0 }
    );

    const pricing = await prisma.monthlyPricing.findUnique({
      where: { year_month: { year, month } },
    });
    const systemRevenueBeforeTax = pricing
      ? systemTotals.forwardCount * pricing.forwardPriceBeforeTax +
        systemTotals.reverseCount * pricing.reversePriceBeforeTax
      : 0;

    const data = {
      sourceFileName: req.file.originalname,
      excelForwardCount: parsed.forwardCount,
      excelReverseCount: parsed.reverseCount,
      excelRevenueBeforeTax: parsed.revenueBeforeTax,
      systemForwardCount: systemTotals.forwardCount,
      systemReverseCount: systemTotals.reverseCount,
      systemRevenueBeforeTax,
      forwardCountDifference: parsed.forwardCount - systemTotals.forwardCount,
      reverseCountDifference: parsed.reverseCount - systemTotals.reverseCount,
      revenueDifference: parsed.revenueBeforeTax - systemRevenueBeforeTax,
    };

    const record = await prisma.reconciliationRecord.upsert({
      where: { year_month: { year, month } },
      update: data,
      create: { year, month, ...data },
    });

    res.status(201).json({
      ...record,
      warning: pricing
        ? null
        : "尚未設定該月份的正/逆物流稅前單價，系統計算收入暫以 0 計算。請至「系統設定」設定單價後重新上傳。",
    });
  })
);

// 查看所有月份對帳紀錄
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const records = await prisma.reconciliationRecord.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    res.json(records);
  })
);

// 查看指定月份對帳紀錄
router.get(
  "/:year/:month",
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    const record = await prisma.reconciliationRecord.findUnique({
      where: { year_month: { year, month } },
    });
    if (!record) {
      return res.status(404).json({ error: "尚無此月份的對帳紀錄" });
    }
    res.json(record);
  })
);

export default router;
