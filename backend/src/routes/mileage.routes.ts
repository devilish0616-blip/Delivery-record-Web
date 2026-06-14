import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";
import { withDistances, getPreviousMileage } from "../services/mileageService";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  vehicleId: z.string(),
  endMileage: z.number().nonnegative(),
});

const adminUpdateSchema = z.object({
  endMileage: z.number().nonnegative(),
});

// 模組二：車輛里程記錄 - 新增或覆蓋當日紀錄（同一人、同一天、同一車輛僅保留一筆）
// 僅記錄當日結束里程，行駛里程由應用層比對同車輛前一筆紀錄計算
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, vehicleId, endMileage } = parsed.data;
    const recordDate = parseDateOnly(date);

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    const existing = await prisma.mileageRecord.findUnique({
      where: { userId_date_vehicleId: { userId: req.user!.id, date: recordDate, vehicleId } },
    });
    const previousMileage = await getPreviousMileage(vehicleId, recordDate, existing?.id);
    if (previousMileage !== null && endMileage < previousMileage) {
      return res.status(400).json({ error: `結束里程不可小於前一次紀錄的里程（${previousMileage} km）` });
    }

    const record = await prisma.mileageRecord.upsert({
      where: { userId_date_vehicleId: { userId: req.user!.id, date: recordDate, vehicleId } },
      update: { endMileage },
      create: {
        userId: req.user!.id,
        vehicleId,
        date: recordDate,
        endMileage,
      },
      include: { vehicle: true },
    });

    if (endMileage > vehicle.currentMileage) {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { currentMileage: endMileage } });
      record.vehicle.currentMileage = endMileage;
    }

    const [result] = await withDistances([record]);
    res.status(201).json(result);
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
    if (req.user!.role === "ADMIN" || req.user!.role === "MANAGER") {
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

    res.json(await withDistances(records));
  })
);

// 管理者：修正指定里程紀錄（員工填錯時由後台校正）
router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = adminUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { endMileage } = parsed.data;

    const existing = await prisma.mileageRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "找不到指定里程紀錄" });
    }

    const record = await prisma.mileageRecord.update({
      where: { id: req.params.id },
      data: { endMileage },
      include: { vehicle: true, user: { select: { id: true, name: true } } },
    });
    const [result] = await withDistances([record]);
    res.json(result);
  })
);

// 管理者：刪除指定里程紀錄（員工填錯車輛或重複登錄時刪除）
router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.mileageRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "找不到指定里程紀錄" });
    }
    await prisma.mileageRecord.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
