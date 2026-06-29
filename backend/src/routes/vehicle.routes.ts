import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { DEFAULT_MAINTENANCE_ITEMS, listVehicleStatuses } from "../services/vehicleService";
import { withDistances } from "../services/mileageService";
import { parseDateOnly } from "../utils/date";
import { VehicleType } from "@prisma/client";

const router = Router();
router.use(requireAuth);

// 證件／稅務到期日欄位（皆為選填，傳入 YYYY-MM-DD 字串或 null）
const docDateSchema = z.string().min(1).nullable().optional();
const documentFields = {
  insuranceCompulsoryExpiry: docDateSchema,
  insuranceLiabilityExpiry: docDateSchema,
  inspectionExpiry: docDateSchema,
  licenseTaxDueDate: docDateSchema,
  fuelTaxDueDate: docDateSchema,
};

const DOC_KEYS = [
  "insuranceCompulsoryExpiry",
  "insuranceLiabilityExpiry",
  "inspectionExpiry",
  "licenseTaxDueDate",
  "fuelTaxDueDate",
] as const;

// 將請求中的證件日期欄位轉成 Prisma 可用的 Date | null（未提供的欄位不動）
function buildDocumentData(data: Record<string, unknown>): Record<string, Date | null> {
  const out: Record<string, Date | null> = {};
  for (const key of DOC_KEYS) {
    if (key in data) {
      const value = data[key];
      out[key] = value ? parseDateOnly(value as string) : null;
    }
  }
  return out;
}

const createSchema = z.object({
  plateNumber: z.string().min(1, "請輸入車牌號碼"),
  type: z.nativeEnum(VehicleType),
  note: z.string().optional().nullable(),
  initialMileage: z.number().nonnegative().optional(),
  ...documentFields,
});

const updateSchema = z.object({
  plateNumber: z.string().min(1).optional(),
  type: z.nativeEnum(VehicleType).optional(),
  note: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  currentMileage: z.number().nonnegative().optional(),
  ...documentFields,
});

const maintenanceItemSchema = z.object({
  itemName: z.string().min(1, "請輸入保養項目名稱"),
  intervalKm: z.number().positive("更換週期需大於 0"),
  intervalDays: z.number().int().positive("時間週期需大於 0").nullable().optional(),
  lastChangeMileage: z.number().nonnegative().optional(),
});

const markChangedSchema = z.object({
  note: z.string().optional().nullable(),
  mileage: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  vendor: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
});

const editMaintenanceItemSchema = z.object({
  itemName: z.string().min(1, "請輸入保養項目名稱").optional(),
  intervalKm: z.number().positive("更換週期需大於 0").optional(),
  intervalDays: z.number().int().positive("時間週期需大於 0").nullable().optional(),
});

const maintenanceLogSchema = z.object({
  date: z.string(),
  mileage: z.number().nonnegative().optional(),
  itemName: z.string().min(1, "請輸入維修／保養項目"),
  cost: z.number().nonnegative().optional(),
  vendor: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
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
        ...buildDocumentData(parsed.data as Record<string, unknown>),
        maintenanceItems: {
          create: DEFAULT_MAINTENANCE_ITEMS[type].map((item) => ({
            itemName: item.itemName,
            intervalKm: item.intervalKm,
            intervalDays: item.intervalDays,
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

    const { type, plateNumber, note, isActive, currentMileage } = parsed.data;

    const updated = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: {
        ...(plateNumber !== undefined ? { plateNumber } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(currentMileage !== undefined ? { currentMileage } : {}),
        ...(type !== undefined ? { type } : {}),
        ...buildDocumentData(parsed.data as Record<string, unknown>),
      },
    });

    // 變更車型時，重置該車輛的保養項目為新車型的預設項目
    if (type !== undefined && type !== vehicle.type) {
      await prisma.vehicleMaintenanceItem.deleteMany({ where: { vehicleId: req.params.id } });
      await prisma.vehicleMaintenanceItem.createMany({
        data: DEFAULT_MAINTENANCE_ITEMS[type].map((item) => ({
          vehicleId: req.params.id,
          itemName: item.itemName,
          intervalKm: item.intervalKm,
          intervalDays: item.intervalDays,
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
    await prisma.maintenanceLog.deleteMany({ where: { vehicleId: req.params.id } });
    await prisma.repairRequest.deleteMany({ where: { vehicleId: req.params.id } });
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
    const changedAt = parsed.data.date ? parseDateOnly(parsed.data.date) : new Date();

    const updated = await prisma.vehicleMaintenanceItem.update({
      where: { id: req.params.itemId },
      data: {
        lastChangeMileage: mileage,
        lastChangeNote: parsed.data.note ?? null,
        lastChangeAt: changedAt,
      },
    });

    if (mileage > vehicle.currentMileage) {
      await prisma.vehicle.update({ where: { id: req.params.id }, data: { currentMileage: mileage } });
    }

    // 同步寫入永久維修保養履歷（含費用），即使日後此保養項目被刪除仍保留紀錄
    await prisma.maintenanceLog.create({
      data: {
        vehicleId: req.params.id,
        date: changedAt,
        mileage,
        itemName: item.itemName,
        cost: parsed.data.cost ?? 0,
        vendor: parsed.data.vendor ?? null,
        note: parsed.data.note ?? null,
        createdById: req.user!.id,
      },
    });

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

    const { itemName, intervalKm, intervalDays, lastChangeMileage } = parsed.data;
    const item = await prisma.vehicleMaintenanceItem.create({
      data: {
        vehicleId: req.params.id,
        itemName,
        intervalKm,
        intervalDays: intervalDays ?? null,
        lastChangeMileage: lastChangeMileage ?? vehicle.currentMileage,
      },
    });
    res.status(201).json(item);
  })
);

// 管理者或主管：編輯保養項目（名稱、更換週期），不影響上次更換基準
router.put(
  "/:id/maintenance/:itemId",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = editMaintenanceItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }

    const item = await prisma.vehicleMaintenanceItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.vehicleId !== req.params.id) {
      return res.status(404).json({ error: "找不到指定保養項目" });
    }

    const { itemName, intervalKm, intervalDays } = parsed.data;
    const updated = await prisma.vehicleMaintenanceItem.update({
      where: { id: req.params.itemId },
      data: {
        ...(itemName !== undefined ? { itemName } : {}),
        ...(intervalKm !== undefined ? { intervalKm } : {}),
        ...(intervalDays !== undefined ? { intervalDays } : {}),
      },
    });
    res.json(updated);
  })
);

// 管理者或主管：車輛維修保養履歷（含費用統計）
router.get(
  "/:id/logs",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    const logs = await prisma.maintenanceLog.findMany({
      where: { vehicleId: req.params.id },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    });

    const now = new Date();
    const thisYear = now.getUTCFullYear();
    const thisMonth = now.getUTCMonth();
    let totalCost = 0;
    let yearCost = 0;
    let monthCost = 0;
    for (const log of logs) {
      totalCost += log.cost;
      if (log.date.getUTCFullYear() === thisYear) {
        yearCost += log.cost;
        if (log.date.getUTCMonth() === thisMonth) monthCost += log.cost;
      }
    }

    res.json({
      logs: logs.map((l) => ({
        id: l.id,
        date: l.date.toISOString(),
        mileage: l.mileage,
        itemName: l.itemName,
        cost: l.cost,
        vendor: l.vendor,
        note: l.note,
        createdByName: l.createdBy?.name ?? null,
      })),
      summary: { totalCost, yearCost, monthCost, count: logs.length },
    });
  })
);

// 管理者或主管：手動新增一筆維修保養履歷（適用非週期性的臨時維修）
router.post(
  "/:id/logs",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = maintenanceLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    const log = await prisma.maintenanceLog.create({
      data: {
        vehicleId: req.params.id,
        date: parseDateOnly(parsed.data.date),
        mileage: parsed.data.mileage ?? vehicle.currentMileage,
        itemName: parsed.data.itemName,
        cost: parsed.data.cost ?? 0,
        vendor: parsed.data.vendor ?? null,
        note: parsed.data.note ?? null,
        createdById: req.user!.id,
      },
    });
    res.status(201).json(log);
  })
);

// 管理者或主管：刪除一筆維修保養履歷
router.delete(
  "/:id/logs/:logId",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const log = await prisma.maintenanceLog.findUnique({ where: { id: req.params.logId } });
    if (!log || log.vehicleId !== req.params.id) {
      return res.status(404).json({ error: "找不到指定履歷紀錄" });
    }
    await prisma.maintenanceLog.delete({ where: { id: req.params.logId } });
    res.status(204).send();
  })
);

// 管理者或主管：車輛待辦提醒彙整（保養到期／證件到期／待處理報修）
router.get(
  "/alerts",
  requireAdminOrManager,
  asyncHandler(async (_req, res) => {
    const statuses = await listVehicleStatuses();
    const maintenance = statuses
      .filter((v) => v.isActive && (v.needsMaintenance || v.maintenanceWarning))
      .map((v) => ({
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        items: v.maintenanceItems
          .filter((m) => m.needsChange || m.warning)
          .map((m) => ({ itemName: m.itemName, needsChange: m.needsChange, remaining: m.remaining, remainingDays: m.remainingDays })),
      }));
    const documents = statuses
      .filter((v) => v.isActive && (v.documentExpired || v.documentExpiring))
      .map((v) => ({
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        docs: v.documents
          .filter((d) => d.expired || d.expiring)
          .map((d) => ({ label: d.label, date: d.date, daysUntil: d.daysUntil, expired: d.expired })),
      }));
    const repairs = statuses
      .filter((v) => v.openRepairCount > 0)
      .map((v) => ({ vehicleId: v.id, plateNumber: v.plateNumber, openRepairCount: v.openRepairCount }));

    res.json({
      maintenance,
      documents,
      repairs,
      counts: {
        maintenance: maintenance.length,
        documents: documents.length,
        repairs: repairs.reduce((sum, r) => sum + r.openRepairCount, 0),
      },
    });
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
