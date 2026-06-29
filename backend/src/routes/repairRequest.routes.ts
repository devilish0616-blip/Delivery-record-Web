import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";
import { RepairRequestStatus } from "@prisma/client";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  vehicleId: z.string().min(1, "請選擇車輛"),
  description: z.string().min(1, "請描述車輛異常狀況"),
});

// 更新處理狀態；標記完成時可一併寫入維修保養履歷
const updateSchema = z.object({
  status: z.nativeEnum(RepairRequestStatus),
  resolveNote: z.string().optional().nullable(),
  log: z
    .object({
      itemName: z.string().min(1),
      cost: z.number().nonnegative().optional(),
      mileage: z.number().nonnegative().optional(),
      vendor: z.string().optional().nullable(),
      date: z.string().optional().nullable(),
    })
    .optional(),
});

const include = {
  vehicle: { select: { id: true, plateNumber: true, type: true } },
  reportedBy: { select: { id: true, name: true } },
  handledBy: { select: { id: true, name: true } },
};

// 回報車輛異常（所有登入者皆可）
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const vehicle = await prisma.vehicle.findUnique({ where: { id: parsed.data.vehicleId } });
    if (!vehicle) return res.status(404).json({ error: "找不到指定車輛" });

    const repair = await prisma.repairRequest.create({
      data: {
        vehicleId: parsed.data.vehicleId,
        description: parsed.data.description,
        reportedById: req.user!.id,
      },
      include,
    });
    res.status(201).json(repair);
  })
);

// 查自己回報的報修
router.get(
  "/my",
  asyncHandler(async (req, res) => {
    const repairs = await prisma.repairRequest.findMany({
      where: { reportedById: req.user!.id },
      include,
      orderBy: { createdAt: "desc" },
    });
    res.json(repairs);
  })
);

// 查所有報修（ADMIN/MANAGER）
router.get(
  "/",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { status, vehicleId } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (vehicleId) where.vehicleId = vehicleId;

    const repairs = await prisma.repairRequest.findMany({
      where,
      include,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    res.json(repairs);
  })
);

// 更新報修狀態（ADMIN/MANAGER）；標記完成時可寫入維修履歷
router.put(
  "/:id",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const repair = await prisma.repairRequest.findUnique({ where: { id: req.params.id } });
    if (!repair) return res.status(404).json({ error: "找不到此報修紀錄" });

    const { status, resolveNote, log } = parsed.data;
    const isClosing = status === "DONE" || status === "CANCELLED";

    const updated = await prisma.repairRequest.update({
      where: { id: req.params.id },
      data: {
        status,
        resolveNote: resolveNote ?? null,
        handledById: req.user!.id,
        handledAt: isClosing ? new Date() : null,
      },
      include,
    });

    // 完成時可選擇將此次維修寫入車輛的維修保養履歷
    if (status === "DONE" && log) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: repair.vehicleId } });
      await prisma.maintenanceLog.create({
        data: {
          vehicleId: repair.vehicleId,
          date: log.date ? parseDateOnly(log.date) : new Date(),
          mileage: log.mileage ?? vehicle?.currentMileage ?? 0,
          itemName: log.itemName,
          cost: log.cost ?? 0,
          vendor: log.vendor ?? null,
          note: repair.description,
          createdById: req.user!.id,
        },
      });
    }

    res.json(updated);
  })
);

// 刪除報修：ADMIN/MANAGER 可刪任何；回報者可撤回自己的待處理紀錄
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const repair = await prisma.repairRequest.findUnique({ where: { id: req.params.id } });
    if (!repair) return res.status(404).json({ error: "找不到此報修紀錄" });

    const role = req.user!.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
      if (repair.reportedById !== req.user!.id) {
        return res.status(403).json({ error: "僅能刪除自己回報的紀錄" });
      }
      if (repair.status !== "PENDING") {
        return res.status(400).json({ error: "僅能撤回待處理的報修" });
      }
    }

    await prisma.repairRequest.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
