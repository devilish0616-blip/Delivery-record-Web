import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  vehicleId: z.string(),
  startMileage: z.number().nonnegative(),
  endMileage: z.number().nonnegative(),
});

function withDistance<T extends { startMileage: number; endMileage: number }>(record: T) {
  return { ...record, distance: record.endMileage - record.startMileage };
}

// 模組二：車輛里程記錄 - 新增當日紀錄
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, vehicleId, startMileage, endMileage } = parsed.data;

    if (endMileage < startMileage) {
      return res.status(400).json({ error: "結束里程不可小於起始里程" });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    const record = await prisma.mileageRecord.create({
      data: {
        userId: req.user!.id,
        vehicleId,
        date: parseDateOnly(date),
        startMileage,
        endMileage,
      },
      include: { vehicle: true },
    });

    res.status(201).json(withDistance(record));
  })
);

// 員工查看自己的里程紀錄；管理者可用 userId / vehicleId 篩選
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId: queryUserId, vehicleId, from, to } = req.query as Record<
      string,
      string | undefined
    >;

    const where: Record<string, unknown> = {};
    if (req.user!.role === "ADMIN") {
      if (queryUserId) where.userId = queryUserId;
      if (vehicleId) where.vehicleId = vehicleId;
    } else {
      where.userId = req.user!.id;
    }
    if (from || to) {
      where.date = {
        ...(from ? { gte: parseDateOnly(from) } : {}),
        ...(to ? { lte: parseDateOnly(to) } : {}),
      };
    }

    const records = await prisma.mileageRecord.findMany({
      where,
      include: { vehicle: true, user: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    });

    res.json(records.map(withDistance));
  })
);

export default router;
