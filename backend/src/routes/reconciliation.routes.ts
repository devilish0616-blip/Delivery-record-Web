import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseSupplierExcel } from "../services/reconciliationService";
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

const COMMISSION_RATE = Number(process.env.SUPPLIER_COMMISSION_RATE ?? "0.09");

// 模組四：上傳貨運行月結 Excel，解析並建立對帳結果
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
      parsed = await parseSupplierExcel(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const monthStart = startOfMonth(year, month);
    const monthEnd = startOfNextMonth(year, month);
    const deliveryRecords = await prisma.deliveryRecord.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      select: { forwardCount: true, reverseCount: true },
    });
    const systemTotalCount = deliveryRecords.reduce(
      (sum, r) => sum + r.forwardCount + r.reverseCount,
      0
    );

    const commissionAmount = parsed.totalAmount * COMMISSION_RATE;
    const netAmount = parsed.totalAmount * (1 - COMMISSION_RATE);
    const countDifference = parsed.totalCount - systemTotalCount;

    const record = await prisma.reconciliationRecord.upsert({
      where: { year_month: { year, month } },
      update: {
        sourceFileName: req.file.originalname,
        excelTotalCount: parsed.totalCount,
        excelTotalAmount: parsed.totalAmount,
        systemTotalCount,
        commissionRate: COMMISSION_RATE,
        commissionAmount,
        netAmount,
        countDifference,
      },
      create: {
        year,
        month,
        sourceFileName: req.file.originalname,
        excelTotalCount: parsed.totalCount,
        excelTotalAmount: parsed.totalAmount,
        systemTotalCount,
        commissionRate: COMMISSION_RATE,
        commissionAmount,
        netAmount,
        countDifference,
      },
    });

    res.status(201).json(record);
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
