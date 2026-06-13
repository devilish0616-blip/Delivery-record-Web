import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";
import { DailyRoleType } from "@prisma/client";

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  date: z.string(),
  role: z.nativeEnum(DailyRoleType),
});

// 模組三B：每日司機／隨車人員角色 - 員工自填（覆蓋機制）
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, role } = parsed.data;
    const record = await prisma.dailyRoleRecord.upsert({
      where: { userId_date: { userId: req.user!.id, date: parseDateOnly(date) } },
      update: { role },
      create: { userId: req.user!.id, date: parseDateOnly(date), role },
    });
    res.json(record);
  })
);

// 查詢角色紀錄：員工查自己；管理者／主管可用 userId 查詢指定員工
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId: queryUserId, date, from, to } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (req.user!.role === "ADMIN" || req.user!.role === "MANAGER") {
      if (queryUserId) where.userId = queryUserId;
    } else {
      where.userId = req.user!.id;
    }
    if (date) {
      where.date = parseDateOnly(date);
    } else if (from || to) {
      where.date = {
        ...(from ? { gte: parseDateOnly(from) } : {}),
        ...(to ? { lte: parseDateOnly(to) } : {}),
      };
    }
    const records = await prisma.dailyRoleRecord.findMany({
      where,
      orderBy: { date: "desc" },
    });
    res.json(records);
  })
);

// 管理者或主管：修改任何人指定日期的今日角色
router.put(
  "/:userId/:date",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ role: z.nativeEnum(DailyRoleType) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const date = parseDateOnly(req.params.date);
    const record = await prisma.dailyRoleRecord.upsert({
      where: { userId_date: { userId: req.params.userId, date } },
      update: { role: parsed.data.role },
      create: { userId: req.params.userId, date, role: parsed.data.role },
    });
    res.json(record);
  })
);

export default router;
