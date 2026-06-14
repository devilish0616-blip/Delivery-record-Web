import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { DEFAULT_MAINTENANCE_ITEMS, listVehicleStatuses } from "../services/vehicleService";
import { withDistances } from "../services/mileageService";
import { VehicleType } from "@prisma/client";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  plateNumber: z.string().min(1, "請輸入車牌號碼"),
  type: z.nativeEnum(VehicleType),
  note: z.string().optional().nullable(),
  initialMileage: z.number().nonnegative().optional(),
});

const updateSchema = z.object({
  plateNumber: z.string().min(1).optional(),
  type: z.nativeEnum(VehicleType).optional(),
  note: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  currentMileage: z.number().nonnegative().optional(),
});

const maintenanceItemSchema = z.object({
  itemName: z.string().min(1, "請輸入保養項目名稱"),
  intervalKm: z.number().positive("更換週期需大於 0"),
  lastChangeMileage: z.number().nonnegative().optional(),
});

const markChangedSchema = z.object({
  note: z.string().optional().nullable(),
  mileage: z.number().nonnegative().optional(),
});

// 員工：取得可用車輛下拉選單（僅啟用中車輛）
router.get(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user!.role === "ADMIN" || req.user!.role === "MANAGER") {
      const statuses = await listVehicleStatuses();
      return res.json(statuses);
    }
    const vehicles = await prisma.vehicle.findMany({
      where: { isActive: true },
      orderBy: { plateNumber: "asc" },
      select: { id: true, plateNumber: true, type: true, note: true, currentMileage: true },
    });
    res.json(vehicles);
  })
);

// 管理者：新增車輛，並依車型建立預設保養項目
router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { plateNumber, type, note, initialMileage } = parsed.data;

    const existing = await prisma.vehicle.findUnique({ where: { plateNumber } });
    if (existing) {
      return res.status(409).json({ error: "此車牌號碼已存在" });
    }

    const mileage = initialMileage ?? 0;
    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumber,
        type,
        note,
        currentMileage: mileage,
        maintenanceItems: {
          create: DEFAULT_MAINTENANCE_ITEMS[type].map((item) => ({
            itemName: item.itemName,
            intervalKm: item.intervalKm,
            lastChangeMileage: mileage,
          })),
        },
      },
    });
    res.status(201).json(vehicle);
  })
);

// 管理者：編輯車輛（車牌、備註、啟用狀態、目前累計里程）
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

    const { type, ...rest } = parsed.data;

    const updated = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: { ...rest, ...(type !== undefined ? { type } : {}) },
    });

    // 變更車型時，重置該車輛的保養項目為新車型的預設項目
    if (type !== undefined && type !== vehicle.type) {
      await prisma.vehicleMaintenanceItem.deleteMany({ where: { vehicleId: req.params.id } });
      await prisma.vehicleMaintenanceItem.createMany({
        data: DEFAULT_MAINTENANCE_ITEMS[type].map((item) => ({
          vehicleId: req.params.id,
          itemName: item.itemName,
          intervalKm: item.intervalKm,
          lastChangeMileage: updated.currentMileage,
        })),
      });
    }

    res.json(updated);
  })
);

// 管理者：刪除車輛（僅限尚無里程／派遣紀錄的車輛，避免破壞歷史資料）
router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    const mileageCount = await prisma.mileageRecord.count({ where: { vehicleId: req.params.id } });
    if (mileageCount > 0) {
      return res.status(400).json({ error: "此車輛已有里程紀錄，無法刪除，請改為停用" });
    }

    await prisma.vehicleMaintenanceItem.deleteMany({ where: { vehicleId: req.params.id } });
    await prisma.vehicle.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// 管理者或主管：標記某保養項目已更換，重置基準里程為目前累計里程並記錄備註
router.patch(
  "/:id/maintenance/:itemId",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = markChangedSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }
    const item = await prisma.vehicleMaintenanceItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.vehicleId !== req.params.id) {
      return res.status(404).json({ error: "找不到指定保養項目" });
    }

    const mileage = parsed.data.mileage ?? vehicle.currentMileage;

    const updated = await prisma.vehicleMaintenanceItem.update({
      where: { id: req.params.itemId },
      data: {
        lastChangeMileage: mileage,
        lastChangeNote: parsed.data.note ?? null,
        lastChangeAt: new Date(),
      },
    });

    if (mileage > vehicle.currentMileage) {
      await prisma.vehicle.update({ where: { id: req.params.id }, data: { currentMileage: mileage } });
    }

    res.json(updated);
  })
);

// 管理者或主管：新增自訂保養項目
router.post(
  "/:id/maintenance",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = maintenanceItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    const { itemName, intervalKm, lastChangeMileage } = parsed.data;
    const item = await prisma.vehicleMaintenanceItem.create({
      data: {
        vehicleId: req.params.id,
        itemName,
        intervalKm,
        lastChangeMileage: lastChangeMileage ?? vehicle.currentMileage,
      },
    });
    res.status(201).json(item);
  })
);

// 管理者或主管：查看車輛使用歷史（里程紀錄＋當日角色），協助決定是否停用
router.get(
  "/:id/usage",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    const records = await prisma.mileageRecord.findMany({
      where: { vehicleId: req.params.id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
      take: 30,
    });

    const roles = records.length
      ? await prisma.dailyRoleRecord.findMany({
          where: { OR: records.map((r) => ({ userId: r.userId, date: r.date })) },
        })
      : [];
    const roleMap = new Map(roles.map((r) => [`${r.userId}_${r.date.toISOString()}`, r.role]));

    const distanced = await withDistances(records);

    res.json(
      distanced.map((r) => ({
        id: r.id,
        date: r.date,
        userId: r.userId,
        userName: r.user.name,
        endMileage: r.endMileage,
        distance: r.distance,
        role: roleMap.get(`${r.userId}_${r.date.toISOString()}`) ?? "NONE",
      }))
    );
  })
);

// 管理者或主管：刪除保養項目
router.delete(
  "/:id/maintenance/:itemId",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const item = await prisma.vehicleMaintenanceItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.vehicleId !== req.params.id) {
      return res.status(404).json({ error: "找不到指定保養項目" });
    }
    await prisma.vehicleMaintenanceItem.delete({ where: { id: req.params.itemId } });
    res.status(204).send();
  })
);

export default router;
