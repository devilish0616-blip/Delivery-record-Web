import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  requireAuth,
  requireAdmin,
  requireAdminOrManager,
  requireAdminManagerOrRegionManager,
  getManagedUserIds,
} from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import {
  getAllEmployeesMonthlySalary,
  getEmployeeMonthlySalary,
  getSalaryMonthLock,
  lockSalaryMonth,
  unlockSalaryMonth,
} from "../services/salaryService";
import { generateSalarySlipPdf } from "../services/salaryPdfService";

const router = Router();
router.use(requireAuth);

function parseYearMonth(req: { query: Record<string, unknown> }) {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || !month || month < 1 || month > 12) {
    throw Object.assign(new Error("請提供有效的 year 與 month"), { status: 400 });
  }
  return { year, month };
}

// Excel 工作表名稱不可包含 * ? : \ / [ ] 且長度上限 31 字元，並需避免重複
const INVALID_SHEET_NAME_CHARS = /[*?:\\/[\]]/g;

function sanitizeSheetName(name: string, fallback: string, usedNames: Set<string>): string {
  let cleaned = name.replace(INVALID_SHEET_NAME_CHARS, "").trim().slice(0, 28) || fallback;
  if (usedNames.has(cleaned)) {
    cleaned = `${cleaned.slice(0, 23)}_${fallback.slice(0, 4)}`;
  }
  usedNames.add(cleaned);
  return cleaned;
}

// 員工：查看自己當月薪資明細（已封存則回傳快照）
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const result = await getEmployeeMonthlySalary(req.user!.id, year, month);
    res.json(result);
  })
);

// 管理者/主管/區域經理：查看員工當月薪資明細（區域經理僅可查詢自己區域成員）
// 回傳 { locked, lockedAt, salaries }：已封存的月份 salaries 取自快照
router.get(
  "/",
  requireAdminManagerOrRegionManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      const result = await getAllEmployeesMonthlySalary(year, month, managedIds);
      return res.json(result);
    }
    const result = await getAllEmployeesMonthlySalary(year, month);
    res.json(result);
  })
);

// 管理者/主管/區域經理：查詢某月份封存狀態（供薪資頁顯示鎖頭與封存/解封按鈕）
router.get(
  "/lock-status",
  requireAdminManagerOrRegionManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const lock = await getSalaryMonthLock(year, month);
    let lockedByName: string | null = null;
    if (lock?.lockedById) {
      const locker = await prisma.user.findUnique({
        where: { id: lock.lockedById },
        select: { name: true },
      });
      lockedByName = locker?.name ?? null;
    }
    res.json({
      year,
      month,
      locked: Boolean(lock),
      lockedAt: lock ? lock.lockedAt.toISOString() : null,
      lockedByName,
      note: lock?.note ?? null,
    });
  })
);

// 管理者：封存某月薪資（凍結當下計算結果為快照，可重複封存覆蓋）
const lockSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  note: z.string().optional().nullable(),
});

router.post(
  "/lock",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = lockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, note } = parsed.data;
    const result = await lockSalaryMonth(year, month, req.user!.id, note);
    res.json({ locked: true, ...result });
  })
);

// 管理者：解除某月封存（恢復即時計算，可重新編修後再封存）
const unlockSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

router.post(
  "/unlock",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = unlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month } = parsed.data;
    await unlockSalaryMonth(year, month);
    res.json({ locked: false });
  })
);

// 管理者/主管：匯出當月薪資報表 (Excel)
router.get(
  "/export",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const { salaries: results } = await getAllEmployeesMonthlySalary(year, month);

    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet("薪資總表");
    summarySheet.columns = [
      { header: "員工姓名", key: "userName", width: 16 },
      { header: "職稱", key: "titleCategory", width: 12 },
      { header: "高/低", key: "titleLevel", width: 8 },
      { header: "出勤天數", key: "attendanceDays", width: 10 },
      { header: "當月總件數", key: "totalDeliveryCount", width: 12 },
      { header: "日平均件數", key: "averageDailyCount", width: 12 },
      { header: "按件薪資", key: "pieceWorkTotal", width: 12 },
      { header: "司機加給", key: "driverBonusTotal", width: 12 },
      { header: "隨車加給", key: "attendantBonusTotal", width: 12 },
      { header: "職務加給", key: "jobAllowance", width: 12 },
      { header: "激勵獎金", key: "incentiveBonus", width: 12 },
      { header: "總薪資", key: "totalSalary", width: 12 },
    ];
    for (const r of results) {
      summarySheet.addRow({
        userName: r.userName,
        titleCategory: r.titleCategory,
        titleLevel: r.titleLevel ?? "",
        attendanceDays: r.attendanceDays,
        totalDeliveryCount: r.totalDeliveryCount,
        averageDailyCount: Number(r.averageDailyCount.toFixed(2)),
        pieceWorkTotal: r.pieceWorkTotal,
        driverBonusTotal: r.driverBonusTotal,
        attendantBonusTotal: r.attendantBonusTotal,
        jobAllowance: r.jobAllowance,
        incentiveBonus: r.incentiveBonus,
        totalSalary: r.totalSalary,
      });
    }

    const usedSheetNames = new Set<string>(["薪資總表"]);
    for (const r of results) {
      const sheetName = sanitizeSheetName(r.userName, r.userId.slice(0, 8), usedSheetNames);
      const sheet = workbook.addWorksheet(sheetName);
      sheet.columns = [
        { header: "日期", key: "date", width: 12 },
        { header: "正物流件數", key: "forwardCount", width: 12 },
        { header: "逆物流件數", key: "reverseCount", width: 12 },
        { header: "當日總件數", key: "totalCount", width: 12 },
        { header: "單價", key: "rate", width: 8 },
        { header: "小計", key: "subtotal", width: 10 },
      ];
      for (const d of r.dailyDetails) {
        sheet.addRow(d);
      }
      sheet.addRow({});
      sheet.addRow({ date: "按件薪資合計", subtotal: r.pieceWorkTotal });
      sheet.addRow({ date: "司機加給", subtotal: r.driverBonusTotal });
      sheet.addRow({ date: "隨車加給", subtotal: r.attendantBonusTotal });
      sheet.addRow({ date: "職務加給", subtotal: r.jobAllowance });
      sheet.addRow({ date: "激勵獎金", subtotal: r.incentiveBonus });
      sheet.addRow({ date: "總薪資", subtotal: r.totalSalary });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="salary-${year}-${String(month).padStart(2, "0")}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  })
);

// ---------------------------------------------------------------------------
// 扣薪事項：管理者為員工登記/移除某月份的扣薪項目
// ---------------------------------------------------------------------------

const deductionSchema = z.object({
  userId: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  amount: z.number().positive(),
  reason: z.string().min(1, "請輸入扣薪原因"),
});

// 管理者：新增員工某月份扣薪項目（該月已封存則擋下，需先解封）
router.post(
  "/deductions",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = deductionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const lock = await getSalaryMonthLock(parsed.data.year, parsed.data.month);
    if (lock) {
      return res.status(409).json({ error: "該月份薪資已封存，請先解除封存再編輯扣款" });
    }
    const deduction = await prisma.salaryDeduction.create({ data: parsed.data });
    res.status(201).json(deduction);
  })
);

// 管理者：刪除扣薪項目（該月已封存則擋下，需先解封）
router.delete(
  "/deductions/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const deduction = await prisma.salaryDeduction.findUnique({ where: { id: req.params.id } });
    if (!deduction) {
      return res.status(404).json({ error: "找不到此扣薪項目" });
    }
    const lock = await getSalaryMonthLock(deduction.year, deduction.month);
    if (lock) {
      return res.status(409).json({ error: "該月份薪資已封存，請先解除封存再編輯扣款" });
    }
    await prisma.salaryDeduction.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// 管理者/主管：匯出指定員工當月薪資單 (PDF)
router.get(
  "/:userId/export",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { name: true },
    });
    if (!user) {
      return res.status(404).json({ error: "找不到指定員工" });
    }

    const buffer = await generateSalarySlipPdf(req.params.userId, year, month);

    const monthStr = String(month).padStart(2, "0");
    const filename = `薪資單_${user.name}_${year}年${monthStr}月.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="salary-slip-${year}-${monthStr}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(buffer);
  })
);

// 管理者/主管/區域經理：查看指定員工當月薪資明細（區域經理僅可查詢自己區域成員）
router.get(
  "/:userId",
  requireAdminManagerOrRegionManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      if (!managedIds.includes(req.params.userId)) {
        return res.status(403).json({ error: "您只能查詢自己區域成員的薪資" });
      }
    }
    const result = await getEmployeeMonthlySalary(req.params.userId, year, month);
    res.json(result);
  })
);

export default router;
