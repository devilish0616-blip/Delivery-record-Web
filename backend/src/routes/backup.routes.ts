import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { taipeiDateString } from "../utils/date";
import { exportAll } from "../services/backupService";
import { audit } from "../services/auditService";

// 資料備份（僅董事長）：下載全部資料、查上次備份時間
const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const settings = await prisma.salarySettings.findUnique({ where: { id: 1 } });
    const by = settings?.lastBackupById
      ? await prisma.user.findUnique({ where: { id: settings.lastBackupById }, select: { name: true } })
      : null;
    res.json({ lastBackupAt: settings?.lastBackupAt?.toISOString() ?? null, lastBackupByName: by?.name ?? null });
  })
);

router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const backup = await exportAll();
    const rows = Object.values(backup.tables).reduce((s, t) => s + t.length, 0);
    await prisma.salarySettings.upsert({
      where: { id: 1 },
      update: { lastBackupAt: new Date(), lastBackupById: req.user!.id },
      create: { id: 1, lastBackupAt: new Date(), lastBackupById: req.user!.id },
    });
    await audit(req, { category: "SETTINGS", action: "OTHER", summary: `下載全部資料備份（${Object.keys(backup.tables).length} 張表、${rows} 筆）` });
    const filename = `旭寺物流備份_${taipeiDateString()}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="xusi-backup-${taipeiDateString()}.json"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(JSON.stringify(backup));
  })
);

export default router;
