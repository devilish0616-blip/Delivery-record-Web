import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { buildClosingChecklist } from "../services/closingService";

// 月底結算清單（僅董事長，含記帳與帶入）：?year=&month=，未指定為上個月
const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const year = Number(req.query.year) || prev.getUTCFullYear();
    const month = Number(req.query.month) || prev.getUTCMonth() + 1;
    if (month < 1 || month > 12) return res.status(400).json({ error: "月份須為 1-12" });
    res.json(await buildClosingChecklist(year, month, now));
  })
);

export default router;
