import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { startOfMonth, startOfNextMonth } from "../utils/date";
import { detectAnomalies } from "../services/anomalyService";

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

// 審核時的參考資訊：每筆待審核的油資／停車費 → 這個人這個月（回報日期的月份）已報幾筆、多少錢，
// 這台車上一次加油是幾天前、多少錢，以及資料檢查有沒有標記（同車同天兩筆加油、同人同天同金額停車費）
router.get(
  "/expense-context",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const kind = req.query.kind === "parking" ? "parking" : "fuel";
    const model = (kind === "fuel" ? prisma.fuelReport : prisma.parkingFeeReport) as typeof prisma.fuelReport;
    const pending = await model.findMany({
      where: { status: "PENDING" },
      select: { id: true, employeeId: true, vehicleId: true, date: true, amount: true },
    });
    if (pending.length === 0) return res.json({});

    const minDate = new Date(Math.min(...pending.map((p) => p.date.getTime())));
    const maxDate = new Date(Math.max(...pending.map((p) => p.date.getTime())));
    const rangeStart = startOfMonth(minDate.getUTCFullYear(), minDate.getUTCMonth() + 1);
    const rangeEnd = startOfNextMonth(maxDate.getUTCFullYear(), maxDate.getUTCMonth() + 1);
    const [monthRows, vehicleRows, checks] = await Promise.all([
      model.findMany({
        where: { employeeId: { in: [...new Set(pending.map((p) => p.employeeId))] }, status: { not: "REJECTED" }, date: { gte: rangeStart, lt: rangeEnd } },
        select: { id: true, employeeId: true, date: true, amount: true },
      }),
      kind === "fuel"
        ? prisma.fuelReport.findMany({
            where: {
              vehicleId: { in: pending.map((p) => p.vehicleId).filter((v): v is string => !!v) },
              status: { not: "REJECTED" },
              date: { lte: maxDate, gte: new Date(minDate.getTime() - 120 * 86400000) },
            },
            select: { id: true, vehicleId: true, date: true, amount: true },
            orderBy: { date: "desc" },
          })
        : Promise.resolve([]),
      detectAnomalies(),
    ]);
    const flagKind = kind === "fuel" ? "fuel-duplicate" : "parking-duplicate";
    const flags = checks.items.filter((a) => a.kind === flagKind && !a.dismissed);

    const ym = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const out: Record<string, { monthCount: number; monthTotal: number; lastDaysAgo: number | null; lastAmount: number | null; flag: string | null }> = {};
    for (const p of pending) {
      const sameMonth = monthRows.filter((r) => r.employeeId === p.employeeId && ym(r.date) === ym(p.date));
      const last = vehicleRows.find((r) => r.vehicleId === p.vehicleId && r.id !== p.id && r.date <= p.date);
      out[p.id] = {
        monthCount: sameMonth.length,
        monthTotal: sameMonth.reduce((s, r) => s + r.amount, 0),
        lastDaysAgo: last ? Math.round((p.date.getTime() - last.date.getTime()) / 86400000) : null,
        lastAmount: last ? last.amount : null,
        flag: flags.find((f) => f.key.split(":")[1]?.split(",").includes(p.id))?.title ?? null,
      };
    }
    res.json(out);
  })
);

export default router;
