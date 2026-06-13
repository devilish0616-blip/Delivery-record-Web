import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";

const router = Router();
router.use(requireAuth, requireAdmin);

const createSchema = z.object({
  date: z.string(),
  vehicleId: z.string().optional().nullable(),
  driverId: z.string(),
  attendantId: z.string().optional().nullable(),
});

// 模組三B：每日派遣紀錄 - 新增（記錄當日司機與隨車人員）
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, vehicleId, driverId, attendantId } = parsed.data;

    const record = await prisma.dispatchRecord.create({
      data: {
        date: parseDateOnly(date),
        vehicleId: vehicleId ?? null,
        driverId,
        attendantId: attendantId ?? null,
      },
      include: {
        driver: { select: { id: true, name: true } },
        attendant: { select: { id: true, name: true } },
        vehicle: { select: { id: true, plateNumber: true } },
      },
    });
    res.status(201).json(record);
  })
);

// 查詢派遣紀錄（依日期區間）
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (from || to) {
      where.date = {
        ...(from ? { gte: parseDateOnly(from) } : {}),
        ...(to ? { lte: parseDateOnly(to) } : {}),
      };
    }

    const records = await prisma.dispatchRecord.findMany({
      where,
      include: {
        driver: { select: { id: true, name: true } },
        attendant: { select: { id: true, name: true } },
        vehicle: { select: { id: true, plateNumber: true } },
      },
      orderBy: { date: "desc" },
    });
    res.json(records);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.dispatchRecord.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

export default router;
