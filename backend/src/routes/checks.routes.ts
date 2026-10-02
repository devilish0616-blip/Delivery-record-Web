import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { detectAnomalies } from "../services/anomalyService";

// 資料檢查（異常偵測）：董事長／執行長查看可能打錯的資料，確認沒問題可以收起來
const router = Router();
router.use(requireAuth, requireAdminOrManager);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await detectAnomalies());
  })
);

const keySchema = z.object({ key: z.string().min(1).max(500) });

router.post(
  "/dismiss",
  asyncHandler(async (req, res) => {
    const parsed = keySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "缺少要確認的項目" });
    await prisma.anomalyDismissal.upsert({
      where: { key: parsed.data.key },
      update: { dismissedById: req.user!.id },
      create: { key: parsed.data.key, dismissedById: req.user!.id },
    });
    res.status(201).json({ ok: true });
  })
);

// 取消「沒問題」：該項重新出現在待確認清單
router.post(
  "/undismiss",
  asyncHandler(async (req, res) => {
    const parsed = keySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "缺少要還原的項目" });
    await prisma.anomalyDismissal.deleteMany({ where: { key: parsed.data.key } });
    res.status(204).end();
  })
);

export default router;
