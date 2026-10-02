import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";

// 操作紀錄查詢（僅董事長）：依分類、員工（操作者或對象）、日期區間、關鍵字篩選，新到舊，一次 50 筆往下載入
const router = Router();
router.use(requireAuth, requireAdmin);

const CATEGORIES = ["DELIVERY", "SALARY", "FINANCE", "REVIEW", "EMPLOYEE", "SETTINGS", "ASSET"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TW_OFFSET = 8 * 3600000;
const DAY = 24 * 3600000;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { category, userId, from, to, q, cursor } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    if (category && !CATEGORIES.includes(category)) return res.status(400).json({ error: "分類有誤" });
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
      return res.status(400).json({ error: "日期格式錯誤（YYYY-MM-DD）" });
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(category ? { category } : {}),
      ...(userId ? { OR: [{ actorId: userId }, { targetUserId: userId }] } : {}),
      // 日期以台灣時間（UTC+8）計算：起日 0 點起、迄日含當天
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(parseDateOnly(from).getTime() - TW_OFFSET) } : {}),
              ...(to ? { lt: new Date(parseDateOnly(to).getTime() + DAY - TW_OFFSET) } : {}),
            },
          }
        : {}),
      ...(q ? { summary: { contains: q.trim(), mode: "insensitive" as const } } : {}),
    };

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
  })
);

export default router;
