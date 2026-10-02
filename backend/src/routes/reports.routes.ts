import { Router } from "express";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, toDateOnlyString } from "../utils/date";
import { buildWeeklyReport, mondayOf } from "../services/weeklyReportService";

const router = Router();
router.use(requireAuth, requireAdminOrManager);

// 週報：?start=YYYY-MM-DD（任一天，會換成該週週一）；未指定為上週（最近一個完整的週）
router.get(
  "/weekly",
  asyncHandler(async (req, res) => {
    const today = parseDateOnly(toDateOnlyString(new Date()));
    const thisMonday = mondayOf(today);
    const raw = String(req.query.start ?? "");
    let start: Date;
    if (raw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return res.status(400).json({ error: "日期格式錯誤（YYYY-MM-DD）" });
      start = mondayOf(parseDateOnly(raw));
      if (start > thisMonday) return res.status(400).json({ error: "還沒到的週沒有資料" });
    } else {
      start = mondayOf(new Date(today.getTime() - 7 * 86400000));
    }
    res.json(await buildWeeklyReport(start));
  })
);

export default router;
