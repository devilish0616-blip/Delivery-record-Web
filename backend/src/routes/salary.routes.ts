import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import {
  calculateAllEmployeesMonthlySalary,
  calculateEmployeeMonthlySalary,
} from "../services/salaryService";

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

// 員工：查看自己當月薪資明細
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const result = await calculateEmployeeMonthlySalary(req.user!.id, year, month);
    res.json(result);
  })
);

// 管理者/主管：查看所有員工當月薪資明細
router.get(
  "/",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const results = await calculateAllEmployeesMonthlySalary(year, month);
    res.json(results);
  })
);

// 管理者/主管：匯出當月薪資報表 (Excel)
router.get(
  "/export",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const results = await calculateAllEmployeesMonthlySalary(year, month);

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

// 管理者：新增員工某月份扣薪項目
router.post(
  "/deductions",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = deductionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const deduction = await prisma.salaryDeduction.create({ data: parsed.data });
    res.status(201).json(deduction);
  })
);

// 管理者：刪除扣薪項目
router.delete(
  "/deductions/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.salaryDeduction.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// 管理者/主管：匯出指定員工當月薪資單 (Excel)
router.get(
  "/:userId/export",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const r = await calculateEmployeeMonthlySalary(req.params.userId, year, month);

    const workbook = new ExcelJS.Workbook();

    const summarySheet = workbook.addWorksheet("薪資單");
    summarySheet.columns = [
      { header: "項目", key: "label", width: 16 },
      { header: "內容", key: "value", width: 20 },
    ];
    summarySheet.addRow({ label: "員工姓名", value: r.userName });
    summarySheet.addRow({ label: "年月", value: `${r.year} / ${r.month}` });
    summarySheet.addRow({ label: "出勤天數", value: r.attendanceDays });
    summarySheet.addRow({
      label: "職稱判定",
      value: r.titleLevel ? `${r.titleCategory} (${r.titleLevel})` : r.titleCategory,
    });
    summarySheet.addRow({ label: "當月總件數", value: r.totalDeliveryCount });
    summarySheet.addRow({ label: "日平均件數", value: Number(r.averageDailyCount.toFixed(2)) });
    summarySheet.addRow({});
    summarySheet.addRow({ label: "按件薪資", value: r.pieceWorkTotal });
    summarySheet.addRow({ label: "司機加給", value: r.driverBonusTotal });
    summarySheet.addRow({ label: "隨車加給", value: r.attendantBonusTotal });
    summarySheet.addRow({ label: "職務加給", value: r.jobAllowance });
    summarySheet.addRow({ label: "激勵獎金", value: r.incentiveBonus });
    summarySheet.addRow({ label: "扣款合計", value: -r.deductionTotal });
    summarySheet.addRow({ label: "總薪資", value: r.totalSalary });

    if (r.deductions.length > 0) {
      summarySheet.addRow({});
      summarySheet.addRow({ label: "扣薪項目明細" });
      for (const d of r.deductions) {
        summarySheet.addRow({ label: d.reason, value: -d.amount });
      }
    }

    const detailSheet = workbook.addWorksheet("每日明細");
    detailSheet.columns = [
      { header: "日期", key: "date", width: 12 },
      { header: "正物流件數", key: "forwardCount", width: 12 },
      { header: "逆物流件數", key: "reverseCount", width: 12 },
      { header: "當日總件數", key: "totalCount", width: 12 },
      { header: "單價", key: "rate", width: 8 },
      { header: "小計", key: "subtotal", width: 10 },
    ];
    for (const d of r.dailyDetails) {
      detailSheet.addRow(d);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const encodedName = encodeURIComponent(r.userName);
    const monthStr = String(month).padStart(2, "0");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="salary-${year}-${monthStr}.xlsx"; filename*=UTF-8''salary-${encodedName}-${year}-${monthStr}.xlsx`
    );
    res.send(Buffer.from(buffer));
  })
);

// 管理者/主管：查看指定員工當月薪資明細
router.get(
  "/:userId",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const result = await calculateEmployeeMonthlySalary(req.params.userId, year, month);
    res.json(result);
  })
);

export default router;
