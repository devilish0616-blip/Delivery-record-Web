import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, startOfMonth, startOfNextMonth } from "../utils/date";

const router = Router();
router.use(requireAuth);

// 功能1：取得行事曆資料 - 公司活動／重要日期 + 已核准的請假紀錄
// 可用 year、month 篩選指定月份，否則回傳全部
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { year, month } = req.query as Record<string, string | undefined>;

    let dateRange: { gte: Date; lt: Date } | undefined;
    if (year && month) {
      dateRange = {
        gte: startOfMonth(Number(year), Number(month)),
        lt: startOfNextMonth(Number(year), Number(month)),
      };
    }

    const events = await prisma.calendarEvent.findMany({
      where: dateRange ? { date: dateRange } : {},
      orderBy: { date: "asc" },
    });

    const leaves = await prisma.leaveRequest.findMany({
      where: { status: "APPROVED", ...(dateRange ? { date: dateRange } : {}) },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    });

    res.json({
      events,
      leaves: leaves.map((l) => ({
        id: l.id,
        userId: l.userId,
        userName: l.user.name,
        date: l.date,
      })),
    });
  })
);

const createSchema = z.object({
  date: z.string(),
  title: z.string().min(1, "請輸入活動名稱"),
});

// ADMIN/MANAGER 新增公司活動／重要日期
router.post(
  "/",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, title } = parsed.data;
    const event = await prisma.calendarEvent.create({
      data: { date: parseDateOnly(date), title, createdBy: req.user!.name },
    });
    res.status(201).json(event);
  })
);

// ADMIN/MANAGER 刪除活動
router.delete(
  "/:id",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const event = await prisma.calendarEvent.findUnique({ where: { id: req.params.id } });
    if (!event) {
      return res.status(404).json({ error: "找不到此活動" });
    }
    await prisma.calendarEvent.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
