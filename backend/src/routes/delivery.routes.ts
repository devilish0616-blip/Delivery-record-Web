import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, toDateOnlyString } from "../utils/date";

const router = Router();
router.use(requireAuth);

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

// 嘗試從欄位標題找出符合關鍵字的欄位索引
function findColumnIndex(headerRow: ExcelJS.Row, keywords: string[]): number | null {
  let found: number | null = null;
  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value ?? "").trim();
    if (keywords.some((k) => text.includes(k))) {
      found = colNumber;
    }
  });
  return found;
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "result" in (value as object)) {
    return String((value as { result?: unknown }).result ?? "").trim();
  }
  return String(value).trim();
}

function cellNumber(cell: ExcelJS.Cell): number {
  const value = cell.value;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "result" in value) {
    const result = (value as { result?: unknown }).result;
    return typeof result === "number" ? result : NaN;
  }
  return Number(cellText(cell));
}

// 將儲存格內容解析為日期（支援 Excel 日期格式或 "YYYY/MM/DD"、"YYYY-MM-DD" 文字）
function cellDate(cell: ExcelJS.Cell): Date | null {
  const value = cell.value;
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const text = cellText(cell);
  const match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

const upsertSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  forwardCount: z.number().int().min(0),
  reverseCount: z.number().int().min(0),
  note: z.string().optional().nullable(),
});

// 模組一：員工每日送件記錄 - 新增或更新（同一人同一天僅一筆，可補登）
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, forwardCount, reverseCount, note } = parsed.data;
    const userId = req.user!.id;
    const dateValue = parseDateOnly(date);

    const record = await prisma.deliveryRecord.upsert({
      where: { userId_date: { userId, date: dateValue } },
      update: { forwardCount, reverseCount, note },
      create: { userId, date: dateValue, forwardCount, reverseCount, note },
    });

    res.status(201).json(record);
  })
);

// 管理者：修正指定員工指定日期的送件記錄（員工填錯時由後台校正）
router.put(
  "/:userId/:date",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.omit({ date: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { forwardCount, reverseCount, note } = parsed.data;
    const { userId, date } = req.params;
    const dateValue = parseDateOnly(date);

    const record = await prisma.deliveryRecord.upsert({
      where: { userId_date: { userId, date: dateValue } },
      update: { forwardCount, reverseCount, note },
      create: { userId, date: dateValue, forwardCount, reverseCount, note },
    });

    res.json(record);
  })
);

// 管理者：刪除指定員工指定日期的送件記錄與當日角色登記
router.delete(
  "/:userId/:date",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { userId, date } = req.params;
    const dateValue = parseDateOnly(date);

    await prisma.deliveryRecord.deleteMany({
      where: { userId, date: dateValue },
    });
    await prisma.dailyRoleRecord.deleteMany({
      where: { userId, date: dateValue },
    });

    res.status(204).send();
  })
);

// 員工查看自己的歷史紀錄（按日期列表）；管理者可用 userId 查詢指定員工
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId: queryUserId, from, to } = req.query as Record<string, string | undefined>;

    let targetUserId = req.user!.id;
    if (req.user!.role === "ADMIN" && queryUserId) {
      targetUserId = queryUserId;
    }

    const where: Record<string, unknown> = { userId: targetUserId };
    if (from || to) {
      where.date = {
        ...(from ? { gte: parseDateOnly(from) } : {}),
        ...(to ? { lte: parseDateOnly(to) } : {}),
      };
    }

    const records = await prisma.deliveryRecord.findMany({
      where,
      orderBy: { date: "desc" },
    });

    res.json(records);
  })
);

// 管理者：查看所有員工當日（或指定日期）送件總計，供儀表板/對帳使用
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN") {
      return res.status(403).json({ error: "此操作需要管理者權限" });
    }
    const { from, to } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (from || to) {
      where.date = {
        ...(from ? { gte: parseDateOnly(from) } : {}),
        ...(to ? { lte: parseDateOnly(to) } : {}),
      };
    }

    const records = await prisma.deliveryRecord.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    });

    const totals = records.reduce(
      (acc, r) => {
        acc.forwardTotal += r.forwardCount;
        acc.reverseTotal += r.reverseCount;
        return acc;
      },
      { forwardTotal: 0, reverseTotal: 0 }
    );

    res.json({ records, ...totals });
  })
);

// 需求13：管理者下載批次匯入範本
router.get(
  "/batch-import/template",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("送貨紀錄");
    sheet.columns = [
      { header: "員工姓名", key: "name", width: 14 },
      { header: "日期", key: "date", width: 14 },
      { header: "正物流件數", key: "forwardCount", width: 12 },
      { header: "逆物流件數", key: "reverseCount", width: 12 },
      { header: "備註", key: "note", width: 16 },
    ];
    sheet.addRow({ name: "範例姓名", date: "2026/06/01", forwardCount: 50, reverseCount: 10, note: "" });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="delivery-import-template.xlsx"');
    res.send(Buffer.from(buffer));
  })
);

// 需求13：管理者批次匯入過往送貨紀錄（dryRun=true 僅預覽不寫入）
router.post(
  "/batch-import",
  requireAdmin,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "請上傳 Excel 檔案" });
    }
    const dryRun = req.body.dryRun === "true";

    const workbook = new ExcelJS.Workbook();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(req.file.buffer as any);
    } catch {
      return res.status(400).json({ error: "無法讀取 Excel 檔案，請確認檔案格式" });
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return res.status(400).json({ error: "Excel 檔案中找不到工作表" });
    }

    const headerRow = sheet.getRow(1);
    const nameCol = findColumnIndex(headerRow, ["員工姓名", "姓名", "Email", "email", "帳號"]);
    const dateCol = findColumnIndex(headerRow, ["日期"]);
    const forwardCol = findColumnIndex(headerRow, ["正物流"]);
    const reverseCol = findColumnIndex(headerRow, ["逆物流"]);
    const noteCol = findColumnIndex(headerRow, ["備註"]);

    if (!nameCol || !dateCol || !forwardCol || !reverseCol) {
      return res.status(400).json({
        error: "Excel 格式錯誤，請確認包含「員工姓名或Email」「日期」「正物流件數」「逆物流件數」欄位",
      });
    }

    const failures: { row: number; reason: string }[] = [];
    const rows: {
      rowNumber: number;
      identifier: string;
      date: Date;
      forwardCount: number;
      reverseCount: number;
      note: string | null;
    }[] = [];
    let totalRows = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // 跳過標題列
      const identifier = cellText(row.getCell(nameCol));
      if (!identifier) return; // 跳過空白列
      totalRows++;

      const date = cellDate(row.getCell(dateCol));
      const forwardCount = cellNumber(row.getCell(forwardCol));
      const reverseCount = cellNumber(row.getCell(reverseCol));
      const note = noteCol ? cellText(row.getCell(noteCol)) || null : null;

      if (!date) {
        failures.push({ row: rowNumber, reason: `日期格式錯誤：${cellText(row.getCell(dateCol))}` });
        return;
      }
      if (!Number.isFinite(forwardCount) || forwardCount < 0 || !Number.isFinite(reverseCount) || reverseCount < 0) {
        failures.push({ row: rowNumber, reason: "正物流件數或逆物流件數格式錯誤" });
        return;
      }

      rows.push({ rowNumber, identifier, date, forwardCount, reverseCount, note });
    });

    const employeeNames = new Set<string>();
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    let successCount = 0;

    for (const r of rows) {
      let user = await prisma.user.findFirst({ where: { name: r.identifier } });
      if (!user) {
        user = await prisma.user.findUnique({ where: { email: r.identifier } });
      }
      if (!user) {
        failures.push({ row: r.rowNumber, reason: `找不到員工：${r.identifier}` });
        continue;
      }

      employeeNames.add(user.name);
      if (!minDate || r.date < minDate) minDate = r.date;
      if (!maxDate || r.date > maxDate) maxDate = r.date;

      if (!dryRun) {
        await prisma.deliveryRecord.upsert({
          where: { userId_date: { userId: user.id, date: r.date } },
          update: { forwardCount: r.forwardCount, reverseCount: r.reverseCount, note: r.note },
          create: {
            userId: user.id,
            date: r.date,
            forwardCount: r.forwardCount,
            reverseCount: r.reverseCount,
            note: r.note,
          },
        });
      }
      successCount++;
    }

    res.json({
      dryRun,
      totalRows,
      successCount,
      failureCount: failures.length,
      failures,
      employees: Array.from(employeeNames),
      dateRange:
        minDate && maxDate ? { from: toDateOnlyString(minDate), to: toDateOnlyString(maxDate) } : null,
    });
  })
);

export default router;
