import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getVehicleStatus, listVehicleStatuses } from "../services/vehicleService";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  plateNumber: z.string().min(1, "請輸入車牌號碼"),
  note: z.string().optional().nullable(),
  lastOilChangeMileage: z.number().nonnegative().optional(),
});

const updateSchema = z.object({
  plateNumber: z.string().min(1).optional(),
  note: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// 員工：取得可用車輛下拉選單（僅啟用中車輛）
router.get(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user!.role === "ADMIN") {
      const statuses = await listVehicleStatuses();
      return res.json(statuses);
    }
    const vehicles = await prisma.vehicle.findMany({
      where: { isActive: true },
      orderBy: { plateNumber: "asc" },
      select: { id: true, plateNumber: true, note: true },
    });
    res.json(vehicles);
  })
);

// 管理者：新增車輛
router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { plateNumber, note, lastOilChangeMileage } = parsed.data;

    const existing = await prisma.vehicle.findUnique({ where: { plateNumber } });
    if (existing) {
      return res.status(409).json({ error: "此車牌號碼已存在" });
    }

    const vehicle = await prisma.vehicle.create({
      data: { plateNumber, note, lastOilChangeMileage: lastOilChangeMileage ?? 0 },
    });
    res.status(201).json(vehicle);
  })
);

// 管理者：編輯車輛（車牌、備註、啟用狀態）
router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    const updated = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(updated);
  })
);

// 管理者：標記已換機油，重置基準里程為目前累計里程
router.patch(
  "/:id/oil-change",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = await getVehicleStatus(req.params.id);
    if (!status) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    const updated = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: { lastOilChangeMileage: status.currentMileage },
    });
    res.json(updated);
  })
);

export default router;
