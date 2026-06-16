import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  requireAuth,
  requireAdminManagerOrRegionManager,
  requireAdmin,
  getManagedUserIds,
} from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, startOfMonth, startOfNextMonth } from "../utils/date";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  date: z.string(),
  amount: z.number().positive("金額必須大於 0"),
  note: z.string().optional().nullable(),
});

const rejectSchema = z.object({
  rejectReason: z.string().min(1, "請填寫駁回原因"),
});

const include = {
  employee: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
};

// 新增自己的加油回報（所有登入者皆可）
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, amount, note } = parsed.data;
    const report = await prisma.fuelReport.create({
      data: {
        date: parseDateOnly(date),
        amount,
        note: note || null,
        employeeId: req.user!.id,
      },
      include,
    });
    res.status(201).json(report);
  })
);

// 查自己的加油回報
router.get(
  "/my",
  asyncHandler(async (req, res) => {
    const { year, month } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = { employeeId: req.user!.id };
    if (year && month) {
      const y = Number(year);
      const m = Number(month);
      where.date = { gte: startOfMonth(y, m), lt: startOfNextMonth(y, m) };
    }
    const reports = await prisma.fuelReport.findMany({
      where,
      include,
      orderBy: { date: "desc" },
    });
    res.json(reports);
  })
);

// 查所有加油回報（REGION_MANAGER 以上）
router.get(
  "/",
  requireAdminManagerOrRegionManager,
  asyncHandler(async (req, res) => {
    const { year, month, employeeId, status } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};

    if (year && month) {
      const y = Number(year);
      const m = Number(month);
      where.date = { gte: startOfMonth(y, m), lt: startOfNextMonth(y, m) };
    }
    if (status) where.status = status;
    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      where.employeeId = { in: managedIds };
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    const reports = await prisma.fuelReport.findMany({
      where,
      include,
      orderBy: [{ status: "asc" }, { date: "desc" }],
    });
    res.json(reports);
  })
);

// 核准（REGION_MANAGER 以上）
router.put(
  "/:id/approve",
  requireAdminManagerOrRegionManager,
  asyncHandler(async (req, res) => {
    const report = await prisma.fuelReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: "找不到此加油回報" });

    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      if (!managedIds.includes(report.employeeId)) {
        return res.status(403).json({ error: "您只能審核自己區域成員的加油回報" });
      }
    }
    if (report.status !== "PENDING") {
      return res.status(400).json({ error: "僅能審核待審核狀態的回報" });
    }

    const updated = await prisma.fuelReport.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", reviewedById: req.user!.id, reviewedAt: new Date(), rejectReason: null },
      include,
    });
    res.json(updated);
  })
);

// 駁回（REGION_MANAGER 以上）
router.put(
  "/:id/reject",
  requireAdminManagerOrRegionManager,
  asyncHandler(async (req, res) => {
    const report = await prisma.fuelReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: "找不到此加油回報" });

    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      if (!managedIds.includes(report.employeeId)) {
        return res.status(403).json({ error: "您只能審核自己區域成員的加油回報" });
      }
    }
    if (report.status !== "PENDING") {
      return res.status(400).json({ error: "僅能審核待審核狀態的回報" });
    }

    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "請填寫駁回原因" });
    }

    const updated = await prisma.fuelReport.update({
      where: { id: req.params.id },
      data: {
        status: "REJECTED",
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
        rejectReason: parsed.data.rejectReason,
      },
      include,
    });
    res.json(updated);
  })
);

// 刪除：ADMIN 可刪任何；本人只能刪自己 PENDING 的
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const report = await prisma.fuelReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: "找不到此加油回報" });

    if (req.user!.role !== "ADMIN") {
      if (report.employeeId !== req.user!.id) {
        return res.status(403).json({ error: "僅能刪除自己的加油回報" });
      }
      if (report.status !== "PENDING") {
        return res.status(400).json({ error: "僅能撤回待審核的加油回報" });
      }
    }

    await prisma.fuelReport.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
