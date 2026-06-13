import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
router.use(requireAuth);

// 功能1：取得目前公告（僅一則，最新覆蓋舊的）
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const announcement = await prisma.announcement.findUnique({ where: { id: 1 } });
    res.json(announcement ?? { id: 1, content: "", updatedBy: null, updatedAt: null });
  })
);

const updateSchema = z.object({
  content: z.string(),
});

// ADMIN/MANAGER 更新公告內容
router.put(
  "/",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const announcement = await prisma.announcement.upsert({
      where: { id: 1 },
      update: { content: parsed.data.content, updatedBy: req.user!.name },
      create: { id: 1, content: parsed.data.content, updatedBy: req.user!.name },
    });
    res.json(announcement);
  })
);

export default router;
