import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
router.use(requireAuth);

// 審核中心各分頁的待處理件數（側邊欄與分頁徽章用）。
// 只回傳使用者有權處理的類別：油資／停車費／請假限董事長與執行長，報修另開放具「車輛管理」職務權限者；
// 沒有權限的類別回傳 null，前端據此決定要顯示哪些分頁。
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const isManager = role === "ADMIN" || role === "MANAGER";
    const canRepair = isManager || req.user!.capabilities.includes("MANAGE_VEHICLES");

    const [fuel, parking, leave, repair] = await Promise.all([
      isManager ? prisma.fuelReport.count({ where: { status: "PENDING" } }) : null,
      isManager ? prisma.parkingFeeReport.count({ where: { status: "PENDING" } }) : null,
      isManager ? prisma.leaveRequest.count({ where: { status: "PENDING" } }) : null,
      canRepair ? prisma.repairRequest.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }) : null,
    ]);

    res.json({ fuel, parking, leave, repair });
  })
);

export default router;
