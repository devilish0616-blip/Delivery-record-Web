import { Router, type Response } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  requireAuth,
  requireAdmin,
  requireAdminOrManager,
} from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import {
  getAllEmployeesMonthlySalary,
  getEmployeeMonthlySalary,
  getSalaryMonthLock,
  lockSalaryMonth,
  unlockSalaryMonth,
} from "../services/salaryService";
import { generateSalarySlipPdf, generateSalarySlipsPdf } from "../services/salaryPdfService";
import { audit, money } from "../services/auditService";

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

function sendPdf(res: Response, buffer: Buffer, filename: string, asciiName: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
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

// 本人對某月薪資的確認（封存後才有）；重新封存（lockedAt 改變）後舊的確認視為過期
async function ackFor(userId: string, year: number, month: number, lockedAt: Date | null) {
  const ack = await prisma.salaryAck.findUnique({ where: { userId_year_month: { userId, year, month } } });
  if (!ack) return null;
  return {
    status: ack.status,
    note: ack.note,
    updatedAt: ack.updatedAt.toISOString(),
    outdated: !lockedAt || ack.lockedAt.getTime() !== lockedAt.getTime(),
  };
}

// 員工：查看自己當月薪資明細（已封存則回傳快照）
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const [result, lock] = await Promise.all([
      getEmployeeMonthlySalary(req.user!.id, year, month),
      getSalaryMonthLock(year, month),
    ]);
    // locked：該月已封存（數字為最終版）；未封存為試算中
    res.json({ ...result, locked: Boolean(lock), ack: await ackFor(req.user!.id, year, month, lock?.lockedAt ?? null) });
  })
);

// 員工：下載自己的薪資單 PDF（封存後才能下載，數字才是最終版）
router.get(
  "/me/export",
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    if (!(await getSalaryMonthLock(year, month))) {
      return res.status(409).json({ error: "這個月的薪資還沒結算，結算後才能下載薪資單" });
    }
    const buffer = await generateSalarySlipPdf(req.user!.id, year, month);
    sendPdf(res, buffer, `薪資單_${req.user!.name}_${year}年${String(month).padStart(2, "0")}月.pdf`, `salary-slip-${year}-${month}.pdf`);
  })
);

const ackSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  status: z.enum(["CONFIRMED", "QUESTION"]),
  note: z.string().trim().max(500).optional().nullable(),
});

// 員工：確認薪資單（確認無誤／有疑問＋留言），可以改
router.post(
  "/me/ack",
  asyncHandler(async (req, res) => {
    const parsed = ackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, status } = parsed.data;
    const note = parsed.data.note || null;
    if (status === "QUESTION" && !note) {
      return res.status(400).json({ error: "請寫下哪裡有疑問" });
    }
    const lock = await getSalaryMonthLock(year, month);
    if (!lock) return res.status(409).json({ error: "這個月的薪資還沒結算，結算後才能確認" });
    const snapshot = await prisma.salarySnapshot.findUnique({
      where: { userId_year_month: { userId: req.user!.id, year, month } },
      select: { id: true },
    });
    if (!snapshot) return res.status(404).json({ error: "這個月沒有你的薪資資料" });
    await prisma.salaryAck.upsert({
      where: { userId_year_month: { userId: req.user!.id, year, month } },
      update: { status, note, lockedAt: lock.lockedAt },
      create: { userId: req.user!.id, year, month, status, note, lockedAt: lock.lockedAt },
    });
    res.json(await ackFor(req.user!.id, year, month, lock.lockedAt));
  })
);

// 管理者/主管：查看員工當月薪資明細
// 回傳 { locked, lockedAt, salaries }：已封存的月份 salaries 取自快照
router.get(
  "/",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const result = await getAllEmployeesMonthlySalary(year, month);
    res.json(result);
  })
);

// 管理者/主管：某月每位員工確認薪資單的狀況（封存後）
router.get(
  "/acks",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const lock = await getSalaryMonthLock(year, month);
    const acks = await prisma.salaryAck.findMany({ where: { year, month } });
    res.json(
      acks.map((a) => ({
        userId: a.userId,
        status: a.status,
        note: a.note,
        updatedAt: a.updatedAt.toISOString(),
        outdated: !lock || a.lockedAt.getTime() !== lock.lockedAt.getTime(),
      }))
    );
  })
);

// 管理者/主管：全部（或勾選的）員工薪資單合併成一份 PDF，每人一頁起
router.get(
  "/slips/export",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const raw = typeof req.query.userIds === "string" ? req.query.userIds : "";
    const userIds = raw ? raw.split(",").filter(Boolean) : undefined;
    const buffer = await generateSalarySlipsPdf(year, month, userIds);
    const monthStr = String(month).padStart(2, "0");
    sendPdf(res, buffer, `薪資單_${year}年${monthStr}月_全部.pdf`, `salary-slips-${year}-${monthStr}.pdf`);
  })
);

// 管理者/主管：查詢某月份封存狀態（供薪資頁顯示鎖頭與封存/解封按鈕）
router.get(
  "/lock-status",
  requireAdminOrManager,
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
    await audit(req, { category: "SALARY", action: "LOCK", summary: `封存 ${year} 年 ${month} 月薪資（${result.count} 人）${note ? `：${note}` : ""}` });
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
    await audit(req, { category: "SALARY", action: "UNLOCK", summary: `解除封存 ${year} 年 ${month} 月薪資` });
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
      { header: "適用單價", key: "pieceRate", width: 10 },
      { header: "出勤天數", key: "attendanceDays", width: 10 },
      { header: "當月總件數", key: "totalDeliveryCount", width: 12 },
      { header: "日平均件數", key: "averageDailyCount", width: 12 },
      { header: "按件薪資", key: "pieceWorkTotal", width: 12 },
      { header: "司機加給", key: "driverBonusTotal", width: 12 },
      { header: "隨車加給", key: "attendantBonusTotal", width: 12 },
      { header: "職務加給", key: "jobAllowance", width: 12 },
      { header: "激勵獎金", key: "incentiveBonus", width: 12 },
      { header: "加項", key: "additionTotal", width: 10 },
      { header: "扣款", key: "deductionTotal", width: 10 },
      { header: "未含補貼", key: "totalSalaryExcludingSubsidy", width: 12 },
      { header: "油資補貼", key: "fuelAllowance", width: 12 },
      { header: "停車費補貼", key: "parkingFeeAllowance", width: 12 },
      { header: "總薪資", key: "totalSalary", width: 12 },
    ];
    for (const r of results) {
      summarySheet.addRow({
        userName: r.inactive ? `${r.userName}（已停用）` : r.userName,
        pieceRate: r.pieceRate,
        attendanceDays: r.attendanceDays,
        totalDeliveryCount: r.totalDeliveryCount,
        averageDailyCount: Number(r.averageDailyCount.toFixed(2)),
        pieceWorkTotal: r.pieceWorkTotal,
        driverBonusTotal: r.driverBonusTotal,
        attendantBonusTotal: r.attendantBonusTotal,
        jobAllowance: r.jobAllowance,
        incentiveBonus: r.incentiveBonus,
        additionTotal: r.additionTotal ?? 0,
        deductionTotal: r.deductionTotal ? -r.deductionTotal : 0,
        totalSalaryExcludingSubsidy: r.totalSalaryExcludingSubsidy,
        fuelAllowance: r.fuelAllowance,
        parkingFeeAllowance: r.parkingFeeAllowance,
        totalSalary: r.totalSalary,
      });
    }
    // 合計列：總薪資＝未含補貼＋油資＋停車費，對帳時加得起來
    const sum = (pick: (r: (typeof results)[number]) => number) => results.reduce((t, r) => t + pick(r), 0);
    const totalRow = summarySheet.addRow({
      userName: "合計",
      pieceWorkTotal: sum((r) => r.pieceWorkTotal),
      driverBonusTotal: sum((r) => r.driverBonusTotal),
      attendantBonusTotal: sum((r) => r.attendantBonusTotal),
      jobAllowance: sum((r) => r.jobAllowance),
      incentiveBonus: sum((r) => r.incentiveBonus),
      additionTotal: sum((r) => r.additionTotal ?? 0),
      deductionTotal: -sum((r) => r.deductionTotal),
      totalSalaryExcludingSubsidy: sum((r) => r.totalSalaryExcludingSubsidy),
      fuelAllowance: sum((r) => r.fuelAllowance),
      parkingFeeAllowance: sum((r) => r.parkingFeeAllowance),
      totalSalary: sum((r) => r.totalSalary),
    });
    totalRow.font = { bold: true };

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
      for (const a of r.additions ?? []) sheet.addRow({ date: `加項：${a.reason}`, subtotal: a.amount });
      for (const d of r.deductions) sheet.addRow({ date: `扣款：${d.reason}`, subtotal: -d.amount });
      sheet.addRow({ date: "未含補貼", subtotal: r.totalSalaryExcludingSubsidy });
      for (const f of r.fuelAllowanceItems) {
        sheet.addRow({ date: `油資補貼 ${f.date}${f.carriedFrom ? "（上月補報）" : ""}`, subtotal: f.amount });
      }
      for (const p of r.parkingFeeAllowanceItems) {
        sheet.addRow({ date: `停車費補貼 ${p.date}${p.carriedFrom ? "（上月補報）" : ""}`, subtotal: p.amount });
      }
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
    await audit(req, {
      category: "SALARY",
      action: "CREATE",
      summary: `${deduction.year} 年 ${deduction.month} 月扣款 ${money(deduction.amount)}（${deduction.reason}）`,
      targetUserId: deduction.userId,
      changes: [{ label: "扣款", from: null, to: deduction.amount }],
    });
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
    await audit(req, {
      category: "SALARY",
      action: "DELETE",
      summary: `刪除 ${deduction.year} 年 ${deduction.month} 月扣款 ${money(deduction.amount)}（${deduction.reason}）`,
      targetUserId: deduction.userId,
      changes: [{ label: "扣款", from: deduction.amount, to: null }],
    });
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// 薪資加項：管理者為員工登記某月份的一次性加項（獎金、補發、代墊還款…），封存月份不可改
// ---------------------------------------------------------------------------

const additionSchema = z.object({
  userId: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  amount: z.number().positive("金額必須大於 0"),
  reason: z.string().trim().min(1, "請輸入加項原因"),
});

router.post(
  "/additions",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = additionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    if (await getSalaryMonthLock(parsed.data.year, parsed.data.month)) {
      return res.status(409).json({ error: "該月份薪資已封存，請先解除封存再編輯加項" });
    }
    const addition = await prisma.salaryAddition.create({ data: parsed.data });
    await audit(req, {
      category: "SALARY",
      action: "CREATE",
      summary: `${addition.year} 年 ${addition.month} 月加項 ${money(addition.amount)}（${addition.reason}）`,
      targetUserId: addition.userId,
      changes: [{ label: "加項", from: null, to: addition.amount }],
    });
    res.status(201).json(addition);
  })
);

router.delete(
  "/additions/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const addition = await prisma.salaryAddition.findUnique({ where: { id: req.params.id } });
    if (!addition) return res.status(404).json({ error: "找不到此加項" });
    if (await getSalaryMonthLock(addition.year, addition.month)) {
      return res.status(409).json({ error: "該月份薪資已封存，請先解除封存再編輯加項" });
    }
    await prisma.salaryAddition.delete({ where: { id: addition.id } });
    await audit(req, {
      category: "SALARY",
      action: "DELETE",
      summary: `刪除 ${addition.year} 年 ${addition.month} 月加項 ${money(addition.amount)}（${addition.reason}）`,
      targetUserId: addition.userId,
      changes: [{ label: "加項", from: addition.amount, to: null }],
    });
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
    sendPdf(res, buffer, `薪資單_${user.name}_${year}年${monthStr}月.pdf`, `salary-slip-${year}-${monthStr}.pdf`);
  })
);

// 管理者/主管：查看指定員工當月薪資明細
router.get(
  "/:userId",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req as never);
    const [result, lock] = await Promise.all([
      getEmployeeMonthlySalary(req.params.userId, year, month),
      getSalaryMonthLock(year, month),
    ]);
    res.json({ ...result, locked: Boolean(lock), ack: await ackFor(req.params.userId, year, month, lock?.lockedAt ?? null) });
  })
);

export default router;
