import { Router } from "express";
import ExcelJS from "exceljs";
import { requireAuth, requireAdmin } from "../middleware/auth";
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

// 管理者：查看所有員工當月薪資明細
router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const results = await calculateAllEmployeesMonthlySalary(year, month);
    res.json(results);
  })
);

// 管理者：匯出當月薪資報表 (Excel)
router.get(
  "/export",
  requireAdmin,
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

// 管理者：查看指定員工當月薪資明細
router.get(
  "/:userId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const result = await calculateEmployeeMonthlySalary(req.params.userId, year, month);
    res.json(result);
  })
);

export default router;
