// 記帳模組 API
// 權限：ADMIN（董事長）全功能；具 MANAGE_FINANCE 職務權限者可記帳與看月報，
// 但其記帳為「待審核」，需董事長核准才計入報表；帶入中心與帳務設定僅 ADMIN。

import { Router, type Request, type Response, type NextFunction } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { FinanceCategoryKind, FinanceRecordType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, startOfMonth, startOfNextMonth } from "../utils/date";
import { ensureFinanceDefaults } from "../services/financeService";
import {
  getFinanceAllTimeOverview,
  getMonthlyFinanceReport,
  getYearlyFinanceOverview,
} from "../services/financeReportService";
import {
  getImportCenterStatus,
  importFuelReports,
  importMaintenanceLogs,
  importParkingFeeReports,
  importSalarySnapshots,
} from "../services/financeImportService";
import { generateFinanceReportPdf } from "../services/financePdfService";

// 記帳模組入口守衛：ADMIN 或具 MANAGE_FINANCE 職務權限（不含 MANAGER）
function requireFinanceAccess(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === "ADMIN" || req.user?.capabilities?.includes("MANAGE_FINANCE")) {
    return next();
  }
  return res.status(403).json({ error: "權限不足，需董事長或記帳職務權限" });
}

const router = Router();
router.use(requireAuth, requireFinanceAccess);

// 首次使用時自動建立預設關係人／分類／帶入設定（只跑一次）
let defaultsReady: Promise<void> | null = null;
router.use(
  asyncHandler(async (_req, _res, next) => {
    if (!defaultsReady) defaultsReady = ensureFinanceDefaults();
    await defaultsReady;
    next();
  })
);

function parseYearMonth(query: Record<string, unknown>) {
  const year = Number(query.year);
  const month = Number(query.month);
  if (!year || !month || month < 1 || month > 12) {
    throw Object.assign(new Error("請提供有效的 year 與 month"), { status: 400 });
  }
  return { year, month };
}

const recordInclude = {
  party: { select: { id: true, name: true } },
  counterParty: { select: { id: true, name: true } },
  category: { select: { id: true, kind: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  sourceLinks: {
    select: { id: true, sourceType: true, sourceId: true, amountAtLink: true, sourceLabel: true },
  },
} as const;

// ─── 關係人管理 ──────────────────────────────────────────────────────────────

router.get(
  "/parties",
  asyncHandler(async (_req, res) => {
    const parties = await prisma.financeParty.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(parties);
  })
);

const partyCreateSchema = z.object({
  name: z.string().trim().min(1, "請輸入關係人名稱"),
  isShareholder: z.boolean().optional(),
});

router.post(
  "/parties",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = partyCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const exists = await prisma.financeParty.findUnique({ where: { name: parsed.data.name } });
    if (exists) return res.status(409).json({ error: "已有同名關係人" });
    const maxOrder = await prisma.financeParty.aggregate({ _max: { sortOrder: true } });
    const party = await prisma.financeParty.create({
      data: {
        name: parsed.data.name,
        isShareholder: parsed.data.isShareholder ?? true,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    res.status(201).json(party);
  })
);

const partyUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  isShareholder: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

router.put(
  "/parties/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = partyUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const party = await prisma.financeParty.findUnique({ where: { id: req.params.id } });
    if (!party) return res.status(404).json({ error: "找不到此關係人" });
    if (parsed.data.name && parsed.data.name !== party.name) {
      const dup = await prisma.financeParty.findUnique({ where: { name: parsed.data.name } });
      if (dup) return res.status(409).json({ error: "已有同名關係人" });
    }
    const updated = await prisma.financeParty.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(updated);
  })
);

// ─── 分類管理 ────────────────────────────────────────────────────────────────

router.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.financeCategory.findMany({
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(categories);
  })
);

const categoryCreateSchema = z.object({
  kind: z.nativeEnum(FinanceCategoryKind),
  name: z.string().trim().min(1, "請輸入分類名稱"),
});

router.post(
  "/categories",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = categoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const exists = await prisma.financeCategory.findUnique({
      where: { kind_name: { kind: parsed.data.kind, name: parsed.data.name } },
    });
    if (exists) return res.status(409).json({ error: "已有同名分類" });
    const maxOrder = await prisma.financeCategory.aggregate({
      where: { kind: parsed.data.kind },
      _max: { sortOrder: true },
    });
    const category = await prisma.financeCategory.create({
      data: { ...parsed.data, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
    });
    res.status(201).json(category);
  })
);

const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
});

router.put(
  "/categories/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = categoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const category = await prisma.financeCategory.findUnique({ where: { id: req.params.id } });
    if (!category) return res.status(404).json({ error: "找不到此分類" });
    if (parsed.data.name && parsed.data.name !== category.name) {
      const dup = await prisma.financeCategory.findUnique({
        where: { kind_name: { kind: category.kind, name: parsed.data.name } },
      });
      if (dup) return res.status(409).json({ error: "已有同名分類" });
    }
    const updated = await prisma.financeCategory.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(updated);
  })
);

// ─── 帶入預設關係人設定 ───────────────────────────────────────────────────────

router.get(
  "/settings",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const settings = await prisma.financeSettings.findUnique({ where: { id: 1 } });
    res.json(settings);
  })
);

const settingsSchema = z.object({
  fuelPartyId: z.string().nullable().optional(),
  parkingPartyId: z.string().nullable().optional(),
  maintenancePartyId: z.string().nullable().optional(),
  salaryPartyId: z.string().nullable().optional(),
});

router.put(
  "/settings",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const updated = await prisma.financeSettings.update({ where: { id: 1 }, data: parsed.data });
    res.json(updated);
  })
);

// ─── 帳目 CRUD ──────────────────────────────────────────────────────────────

router.get(
  "/records",
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req.query as Record<string, unknown>);
    const { type, partyId, categoryId, keyword } = req.query as Record<string, string | undefined>;

    const { status } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {
      date: { gte: startOfMonth(year, month), lt: startOfNextMonth(year, month) },
    };
    if (type) where.type = type;
    if (status) where.status = status;
    if (partyId) {
      // 關係人篩選涵蓋內部撥款的雙方
      where.OR = [{ partyId }, { counterPartyId: partyId }];
    }
    if (categoryId) where.categoryId = categoryId;
    if (keyword) {
      where.AND = [
        {
          OR: [
            { note: { contains: keyword } },
            { party: { name: { contains: keyword } } },
            { counterParty: { name: { contains: keyword } } },
            { category: { name: { contains: keyword } } },
          ],
        },
      ];
    }

    const records = await prisma.financeRecord.findMany({
      where,
      include: recordInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    res.json(records);
  })
);

const recordSchema = z
  .object({
    date: z.string().min(1, "請選擇日期"),
    type: z.nativeEnum(FinanceRecordType),
    partyId: z.string().min(1, "請選擇關係人"),
    counterPartyId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    amount: z.number().positive("金額必須大於 0"),
    note: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "TRANSFER") {
      if (!data.counterPartyId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "內部撥款請選擇轉入方" });
      } else if (data.counterPartyId === data.partyId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "轉出方與轉入方不可相同" });
      }
    } else if (!data.categoryId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "請選擇分類" });
    }
  });

// 檢查分類存在且歸屬正確（收入帳配收入分類、支出帳配支出分類）
async function validateCategory(type: FinanceRecordType, categoryId: string | null | undefined) {
  if (type === "TRANSFER") return null; // 內部撥款不設分類
  const category = await prisma.financeCategory.findUnique({ where: { id: categoryId! } });
  if (!category) throw Object.assign(new Error("找不到指定的分類"), { status: 400 });
  const expected = type === "INCOME" ? "INCOME" : "EXPENSE";
  if (category.kind !== expected) {
    throw Object.assign(new Error("分類與帳目類型不符"), { status: 400 });
  }
  return category.id;
}

router.post(
  "/records",
  asyncHandler(async (req, res) => {
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, type, partyId, counterPartyId, categoryId, amount, note } = parsed.data;
    const record = await prisma.financeRecord.create({
      data: {
        date: parseDateOnly(date),
        type,
        partyId,
        counterPartyId: type === "TRANSFER" ? counterPartyId : null,
        categoryId: await validateCategory(type, categoryId),
        amount,
        note: note?.trim() || null,
        createdById: req.user!.id,
        // 董事長記帳直接生效；記帳職務權限者記的帳需審核才計入報表
        status: req.user!.role === "ADMIN" ? "APPROVED" : "PENDING",
      },
      include: recordInclude,
    });
    res.status(201).json(record);
  })
);

router.put(
  "/records/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.financeRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "找不到此帳目" });

    const isAdmin = req.user!.role === "ADMIN";
    if (!isAdmin) {
      // 記帳職務權限者只能改自己的、且尚未核准的帳目；改完重新送審
      if (existing.createdById !== req.user!.id) {
        return res.status(403).json({ error: "僅能編輯自己記的帳目" });
      }
      if (existing.status === "APPROVED") {
        return res.status(403).json({ error: "已核准的帳目僅董事長可編輯" });
      }
    }

    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, type, partyId, counterPartyId, categoryId, amount, note } = parsed.data;
    const record = await prisma.financeRecord.update({
      where: { id: req.params.id },
      data: {
        date: parseDateOnly(date),
        type,
        partyId,
        counterPartyId: type === "TRANSFER" ? counterPartyId : null,
        categoryId: await validateCategory(type, categoryId),
        amount,
        note: note?.trim() || null,
        // 非董事長修改（含被駁回後重改）一律回到待審核
        ...(isAdmin
          ? {}
          : { status: "PENDING" as const, reviewedById: null, reviewedAt: null, rejectReason: null }),
      },
      include: recordInclude,
    });
    res.json(record);
  })
);

// 刪除帳目：cascade 一併刪除來源連結，該來源即可重新帶入
router.delete(
  "/records/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.financeRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "找不到此帳目" });
    if (req.user!.role !== "ADMIN") {
      if (existing.createdById !== req.user!.id) {
        return res.status(403).json({ error: "僅能刪除自己記的帳目" });
      }
      if (existing.status === "APPROVED") {
        return res.status(403).json({ error: "已核准的帳目僅董事長可刪除" });
      }
    }
    await prisma.financeRecord.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// 董事長審核：核准待審核帳目（核准後計入報表）
router.put(
  "/records/:id/approve",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.financeRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "找不到此帳目" });
    if (existing.status !== "PENDING") {
      return res.status(400).json({ error: "僅能審核待審核狀態的帳目" });
    }
    const record = await prisma.financeRecord.update({
      where: { id: req.params.id },
      data: {
        status: "APPROVED",
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
        rejectReason: null,
      },
      include: recordInclude,
    });
    res.json(record);
  })
);

const recordRejectSchema = z.object({
  rejectReason: z.string().trim().min(1, "請填寫駁回原因"),
});

// 董事長審核：駁回待審核帳目（記帳者可修改後重新送審）
router.put(
  "/records/:id/reject",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.financeRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "找不到此帳目" });
    if (existing.status !== "PENDING") {
      return res.status(400).json({ error: "僅能審核待審核狀態的帳目" });
    }
    const parsed = recordRejectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "請填寫駁回原因" });
    }
    const record = await prisma.financeRecord.update({
      where: { id: req.params.id },
      data: {
        status: "REJECTED",
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
        rejectReason: parsed.data.rejectReason,
      },
      include: recordInclude,
    });
    res.json(record);
  })
);

// ─── 月報／年度總覽 ──────────────────────────────────────────────────────────

router.get(
  "/report",
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req.query as Record<string, unknown>);
    res.json(await getMonthlyFinanceReport(year, month));
  })
);

// 總覽（所有時期）：全期間損益＋各股東代墊/領回/剩餘＋分類彙總
router.get(
  "/report/overview",
  asyncHandler(async (_req, res) => {
    res.json(await getFinanceAllTimeOverview());
  })
);

router.get(
  "/report/yearly",
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year);
    if (!year) return res.status(400).json({ error: "請提供有效的 year" });
    res.json(await getYearlyFinanceOverview(year));
  })
);

// ─── 匯出（Excel／PDF） ──────────────────────────────────────────────────────

router.get(
  "/report/export",
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req.query as Record<string, unknown>);
    const report = await getMonthlyFinanceReport(year, month);
    const monthStr = String(month).padStart(2, "0");

    const workbook = new ExcelJS.Workbook();

    const summarySheet = workbook.addWorksheet("損益摘要");
    summarySheet.columns = [
      { header: "項目", key: "label", width: 28 },
      { header: "金額", key: "amount", width: 16 },
    ];
    summarySheet.addRow({ label: "收入合計", amount: report.summary.incomeTotal });
    summarySheet.addRow({ label: "支出合計", amount: report.summary.expenseTotal });
    summarySheet.addRow({ label: "本月淨損益（排除內部撥款）", amount: report.summary.net });

    const categorySheet = workbook.addWorksheet("分類彙總");
    categorySheet.columns = [
      { header: "類型", key: "kind", width: 8 },
      { header: "分類", key: "name", width: 16 },
      { header: "金額", key: "amount", width: 14 },
      { header: "佔比", key: "percent", width: 10 },
      { header: "筆數", key: "count", width: 8 },
    ];
    for (const row of report.expenseByCategory) {
      categorySheet.addRow({
        kind: "支出",
        name: row.categoryName,
        amount: row.amount,
        percent: `${row.percent.toFixed(1)}%`,
        count: row.count,
      });
    }
    for (const row of report.incomeByCategory) {
      categorySheet.addRow({
        kind: "收入",
        name: row.categoryName,
        amount: row.amount,
        percent: `${row.percent.toFixed(1)}%`,
        count: row.count,
      });
    }

    const detailSheet = workbook.addWorksheet("帳務明細");
    detailSheet.columns = [
      { header: "日期", key: "date", width: 12 },
      { header: "類別", key: "type", width: 10 },
      { header: "關係人", key: "party", width: 12 },
      { header: "項目", key: "item", width: 16 },
      { header: "金額", key: "amount", width: 14 },
      { header: "備註", key: "note", width: 40 },
    ];
    const typeLabels: Record<string, string> = { INCOME: "收入", EXPENSE: "支出", TRANSFER: "內部撥款" };
    for (const r of report.records) {
      if (r.type === "TRANSFER") {
        // 與舊系統一致：內部撥款呈現兩個方向
        detailSheet.addRow({
          date: r.date, type: typeLabels[r.type], party: r.partyName,
          item: `撥給 ${r.counterPartyName ?? ""}`, amount: -r.amount, note: r.note ?? "",
        });
        detailSheet.addRow({
          date: r.date, type: typeLabels[r.type], party: r.counterPartyName ?? "",
          item: `收到 ${r.partyName}`, amount: r.amount, note: r.note ?? "",
        });
      } else {
        detailSheet.addRow({
          date: r.date, type: typeLabels[r.type], party: r.partyName,
          item: r.categoryName ?? "", amount: r.type === "EXPENSE" ? -r.amount : r.amount,
          note: r.note ?? "",
        });
      }
    }

    const settlementSheet = workbook.addWorksheet("股東結算");
    settlementSheet.columns = [
      { header: "股東", key: "name", width: 12 },
      { header: "代墊支出", key: "advanced", width: 14 },
      { header: "領回金額", key: "received", width: 14 },
      { header: "剩餘結算", key: "balance", width: 14 },
    ];
    for (const row of report.settlement) {
      settlementSheet.addRow({
        name: row.partyName, advanced: row.advanced, received: row.received, balance: row.balance,
      });
    }
    settlementSheet.addRow({});
    settlementSheet.addRow({ name: "累計結算（開帳以來）" });
    for (const row of report.cumulativeSettlement) {
      settlementSheet.addRow({
        name: row.partyName, advanced: row.advanced, received: row.received, balance: row.balance,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="finance-report-${year}-${monthStr}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  })
);

router.get(
  "/report/export-pdf",
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req.query as Record<string, unknown>);
    const buffer = await generateFinanceReportPdf(year, month);
    const monthStr = String(month).padStart(2, "0");
    const filename = `月報表_${year}_${monthStr}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="finance-report-${year}-${monthStr}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(buffer);
  })
);

// ─── 帶入中心 ────────────────────────────────────────────────────────────────

router.get(
  "/import-center",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req.query as Record<string, unknown>);
    res.json(await getImportCenterStatus(year, month));
  })
);

const importBaseSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  partyId: z.string().optional(),
});

router.post(
  "/import-center/fuel",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = importBaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, partyId } = parsed.data;
    const record = await importFuelReports(year, month, partyId, req.user!.id);
    res.status(201).json(record);
  })
);

router.post(
  "/import-center/parking",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = importBaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, partyId } = parsed.data;
    const record = await importParkingFeeReports(year, month, partyId, req.user!.id);
    res.status(201).json(record);
  })
);

const importMaintenanceSchema = importBaseSchema.extend({
  logIds: z.array(z.string()).min(1, "請勾選要帶入的維修履歷"),
});

router.post(
  "/import-center/maintenance",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = importMaintenanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, partyId, logIds } = parsed.data;
    const records = await importMaintenanceLogs(year, month, logIds, partyId, req.user!.id);
    res.status(201).json(records);
  })
);

const importSalarySchema = importBaseSchema.extend({
  snapshotIds: z.array(z.string()).min(1, "請勾選要帶入的薪資快照"),
});

router.post(
  "/import-center/salary",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = importSalarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, partyId, snapshotIds } = parsed.data;
    const records = await importSalarySnapshots(year, month, snapshotIds, partyId, req.user!.id);
    res.status(201).json(records);
  })
);

export default router;
