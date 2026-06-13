import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";

const router = Router();
router.use(requireAuth);

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

export default router;
