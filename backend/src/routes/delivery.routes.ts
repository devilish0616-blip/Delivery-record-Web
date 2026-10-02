import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { z } from "zod";
import { DailyRoleType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager, requireCapability } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, toDateOnlyString } from "../utils/date";
import { proxyTargets } from "../services/proxyEntryService";

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

    // 本人填寫：清除代填者標記
    const record = await prisma.deliveryRecord.upsert({
      where: { userId_date: { userId, date: dateValue } },
      update: { forwardCount, reverseCount, note, enteredById: null },
      create: { userId, date: dateValue, forwardCount, reverseCount, note },
    });

    res.status(201).json(record);
  })
);

// ─── 代填送件（董事長／執行長代替不會操作的員工填寫） ─────────────────────────
// 執行長與具「代填送件」職務權限者只能代填「代管帳號」；董事長可代填所有啟用中的員工（scope=all）
router.get(
  "/proxy",
  requireCapability("PROXY_DELIVERY"),
  asyncHandler(async (req, res) => {
    const { date, scope } = req.query as Record<string, string | undefined>;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "請提供日期（YYYY-MM-DD）" });
    }
    const day = parseDateOnly(date);
    // 週一為一週起點，供週條顯示每天填寫進度
    const weekStart = new Date(day);
    weekStart.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

    const users = await proxyTargets(req.user!.role, scope);
    const userIds = users.map((u) => u.id);
    const [dayRecords, roles, weekRecords] = await Promise.all([
      prisma.deliveryRecord.findMany({
        where: { userId: { in: userIds }, date: day },
        include: { enteredBy: { select: { name: true } } },
      }),
      prisma.dailyRoleRecord.findMany({ where: { userId: { in: userIds }, date: day } }),
      prisma.deliveryRecord.findMany({
        where: { userId: { in: userIds }, date: { gte: weekStart, lt: weekEnd } },
        select: { date: true },
      }),
    ]);
    const recordBy = new Map(dayRecords.map((r) => [r.userId, r]));
    const roleBy = new Map(roles.map((r) => [r.userId, r.role]));

    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setUTCDate(weekStart.getUTCDate() + i);
      const key = toDateOnlyString(d);
      return { date: key, filled: weekRecords.filter((r) => toDateOnlyString(r.date) === key).length };
    });

    res.json({
      date,
      total: users.length,
      week,
      entries: users.map((u) => {
        const r = recordBy.get(u.id);
        return {
          userId: u.id,
          name: u.name,
          accountNote: u.accountNote,
          isProxyManaged: u.isProxyManaged,
          role: roleBy.get(u.id) ?? "NONE",
          record: r
            ? {
                forwardCount: r.forwardCount,
                reverseCount: r.reverseCount,
                note: r.note,
                enteredByName: r.enteredBy?.name ?? null,
                updatedAt: r.updatedAt,
              }
            : null,
        };
      }),
    });
  })
);

const proxySaveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式錯誤"),
  entries: z
    .array(
      z.object({
        userId: z.string().min(1),
        role: z.nativeEnum(DailyRoleType),
        forwardCount: z.number().int().min(0),
        reverseCount: z.number().int().min(0),
        note: z.string().trim().max(200).optional().nullable(),
      })
    )
    .min(1, "沒有要儲存的資料")
    .max(200),
});

router.post(
  "/proxy",
  requireCapability("PROXY_DELIVERY"),
  asyncHandler(async (req, res) => {
    const parsed = proxySaveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, entries } = parsed.data;
    const isAdmin = req.user!.role === "ADMIN";
    const targets = await prisma.user.findMany({
      where: { id: { in: entries.map((e) => e.userId) }, isActive: true },
      select: { id: true, name: true, isProxyManaged: true },
    });
    const byId = new Map(targets.map((t) => [t.id, t]));
    for (const e of entries) {
      const t = byId.get(e.userId);
      if (!t) return res.status(400).json({ error: "找不到指定的員工或帳號已停用" });
      if (!isAdmin && !t.isProxyManaged) {
        return res.status(403).json({ error: `「${t.name}」不是代管帳號，只有董事長可以代填一般員工` });
      }
    }

    const day = parseDateOnly(date);
    await prisma.$transaction(
      entries.flatMap((e) => {
        const enteredById = e.userId === req.user!.id ? null : req.user!.id;
        const data = { forwardCount: e.forwardCount, reverseCount: e.reverseCount, note: e.note || null, enteredById };
        return [
          prisma.deliveryRecord.upsert({
            where: { userId_date: { userId: e.userId, date: day } },
            update: data,
            create: { userId: e.userId, date: day, ...data },
          }),
          prisma.dailyRoleRecord.upsert({
            where: { userId_date: { userId: e.userId, date: day } },
            update: { role: e.role },
            create: { userId: e.userId, date: day, role: e.role },
          }),
        ];
      })
    );
    res.json({ saved: entries.length });
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

    const enteredById = userId === req.user!.id ? null : req.user!.id;
    const record = await prisma.deliveryRecord.upsert({
      where: { userId_date: { userId, date: dateValue } },
      update: { forwardCount, reverseCount, note, enteredById },
      create: { userId, date: dateValue, forwardCount, reverseCount, note, enteredById },
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
      include: { enteredBy: { select: { id: true, name: true } } },
    });

    res.json(records);
  })
);

// 管理者：查看所有員工當日（或指定日期）送件總計，供儀表板使用
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

// 管理者／執行長：查看每位員工指定年度每月送件件數彙總（績效統計），無紀錄的員工也會列出（件數為0）
router.get(
  "/performance/:year",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: "年度格式錯誤" });
    }

    const rangeStart = new Date(Date.UTC(year, 0, 1));
    const rangeEnd = new Date(Date.UTC(year + 1, 0, 1));

    const [users, records] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.deliveryRecord.findMany({
        where: { date: { gte: rangeStart, lt: rangeEnd } },
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);

    type MonthStat = { forwardCount: number; reverseCount: number; total: number };
    type EmployeeStat = { userId: string; name: string; months: MonthStat[]; yearTotal: MonthStat };

    const emptyMonths = (): MonthStat[] =>
      Array.from({ length: 12 }, () => ({ forwardCount: 0, reverseCount: 0, total: 0 }));

    const statsByUser = new Map<string, EmployeeStat>();
    for (const u of users) {
      statsByUser.set(u.id, {
        userId: u.id,
        name: u.name,
        months: emptyMonths(),
        yearTotal: { forwardCount: 0, reverseCount: 0, total: 0 },
      });
    }

    for (const r of records) {
      let stat = statsByUser.get(r.userId);
      if (!stat) {
        // 已停用的員工仍保留歷史件數，附加於清單末端
        stat = {
          userId: r.userId,
          name: `${r.user.name}（已停用）`,
          months: emptyMonths(),
          yearTotal: { forwardCount: 0, reverseCount: 0, total: 0 },
        };
        statsByUser.set(r.userId, stat);
      }
      const monthIndex = r.date.getUTCMonth();
      const monthStat = stat.months[monthIndex];
      monthStat.forwardCount += r.forwardCount;
      monthStat.reverseCount += r.reverseCount;
      monthStat.total += r.forwardCount + r.reverseCount;
      stat.yearTotal.forwardCount += r.forwardCount;
      stat.yearTotal.reverseCount += r.reverseCount;
      stat.yearTotal.total += r.forwardCount + r.reverseCount;
    }

    res.json({ year, employees: Array.from(statsByUser.values()) });
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
