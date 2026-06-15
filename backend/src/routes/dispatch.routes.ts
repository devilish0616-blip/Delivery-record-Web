import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminManagerOrRegionManager, getManagedUserIds } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, toDateOnlyString } from "../utils/date";
import { withDistances } from "../services/mileageService";

const router = Router();
router.use(requireAuth, requireAdminManagerOrRegionManager);

// 模組三B：派遣紀錄統計（唯讀）
// 依日期彙整當天「誰開了哪台車」（來自車輛里程記錄）與「誰是司機／隨車人員」（來自每日角色記錄）
// 區域經理僅可看到自己區域成員的派遣紀錄
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { date: queryDate } = req.query as Record<string, string | undefined>;
    const date = queryDate ? parseDateOnly(queryDate) : parseDateOnly(toDateOnlyString(new Date()));

    const managedIds =
      req.user!.role === "REGION_MANAGER" ? await getManagedUserIds(req.user!.id) : null;
    const userFilter = managedIds ? { userId: { in: managedIds } } : {};

    const [mileageRecords, dailyRoles, activeUsers] = await Promise.all([
      prisma.mileageRecord.findMany({
        where: { date, ...userFilter },
        include: {
          vehicle: { select: { id: true, plateNumber: true, type: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { vehicleId: "asc" },
      }),
      prisma.dailyRoleRecord.findMany({
        where: { date, ...userFilter },
        include: { user: { select: { id: true, name: true } } },
      }),
      prisma.user.findMany({
        where: { isActive: true, ...(managedIds ? { id: { in: managedIds } } : {}) },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const roleMap = new Map(dailyRoles.map((r) => [r.userId, r.role]));
    const mileageWithDistance = await withDistances(mileageRecords);

    const vehicleMap = new Map<
      string,
      {
        vehicleId: string;
        plateNumber: string;
        type: string;
        users: {
          id: string;
          userId: string;
          userName: string;
          role: string;
          endMileage: number;
          distance: number | null;
        }[];
      }
    >();

    for (const m of mileageWithDistance) {
      if (!vehicleMap.has(m.vehicleId)) {
        vehicleMap.set(m.vehicleId, {
          vehicleId: m.vehicleId,
          plateNumber: m.vehicle.plateNumber,
          type: m.vehicle.type,
          users: [],
        });
      }
      vehicleMap.get(m.vehicleId)!.users.push({
        id: m.id,
        userId: m.userId,
        userName: m.user.name,
        role: roleMap.get(m.userId) ?? "NONE",
        endMileage: m.endMileage,
        distance: m.distance,
      });
    }

    // 當天沒有使用任何車輛的在職員工，也一併列出（方便管理者/主管補登或修正今日角色）
    const usersWithMileage = new Set(mileageRecords.map((m) => m.userId));
    const usersWithoutVehicle = activeUsers
      .filter((u) => !usersWithMileage.has(u.id))
      .map((u) => ({
        userId: u.id,
        userName: u.name,
        role: (roleMap.get(u.id) ?? "NONE") as string,
      }));

    res.json({
      date: toDateOnlyString(date),
      vehicles: Array.from(vehicleMap.values()),
      usersWithoutVehicle,
    });
  })
);

export default router;
