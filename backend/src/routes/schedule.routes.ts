import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireCapability, getManagedUserIds } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  date: z.string(),
  subArea: z.string().min(1, "小區域名稱不能為空"),
  note: z.string().optional().nullable(),
  employeeId: z.string(),
  regionId: z.string().optional().nullable(),
});

const updateSchema = z.object({
  subArea: z.string().min(1).optional(),
  note: z.string().optional().nullable(),
  date: z.string().optional(),
});

const bulkSchema = z.object({
  date: z.string(),
  subArea: z.string().min(1, "小區域名稱不能為空"),
  note: z.string().optional().nullable(),
  employeeIds: z.array(z.string()).min(1, "至少選擇一位員工"),
  regionId: z.string().optional().nullable(),
});

// 取得歷史小區域名稱清單（自動補全用）
router.get(
  "/sub-areas",
  asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = {};
    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      where.employeeId = { in: managedIds };
    }
    const rows = await prisma.schedule.findMany({
      where,
      select: { subArea: true },
      distinct: ["subArea"],
      orderBy: { subArea: "asc" },
    });
    res.json(rows.map((r) => r.subArea));
  })
);

// 可排班的員工清單（id+name）：供排班頁指派下拉。具排班權限者可讀；REGION_MANAGER 僅自己區域成員
router.get(
  "/assignable-employees",
  requireCapability("MANAGE_SCHEDULE", "REGION_MANAGER"),
  asyncHandler(async (req, res) => {
    if (req.user!.role === "REGION_MANAGER") {
      const ids = await getManagedUserIds(req.user!.id);
      const members = await prisma.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return res.json(members);
    }
    const members = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    res.json(members);
  })
);

// 查看自己的排班（EMPLOYEE 使用，管理者也可以用）
router.get(
  "/my",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = { employeeId: req.user!.id };
    if (from && to) {
      where.date = { gte: parseDateOnly(from), lte: parseDateOnly(to) };
    } else if (from) {
      where.date = { gte: parseDateOnly(from) };
    }
    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
      },
      orderBy: { date: "asc" },
    });
    res.json(schedules);
  })
);

// 月曆排班總覽（所有登入者可存取，首頁行事曆使用）
router.get(
  "/calendar",
  asyncHandler(async (req, res) => {
    const { year, month } = req.query as Record<string, string | undefined>;
    if (!year || !month) {
      return res.status(400).json({ error: "請提供 year 和 month" });
    }
    const y = Number(year);
    const m = Number(month);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));

    const schedules = await prisma.schedule.findMany({
      where: { date: { gte: from, lt: to } },
      include: {
        employee: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { subArea: "asc" }],
    });
    res.json(schedules);
  })
);

// 取得排班列表（ADMIN/MANAGER：全公司；REGION_MANAGER：自己區域）
router.get(
  "/",
  requireCapability("MANAGE_SCHEDULE", "REGION_MANAGER"),
  asyncHandler(async (req, res) => {
    const { from, to, regionId, employeeId } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};

    if (from && to) {
      where.date = { gte: parseDateOnly(from), lte: parseDateOnly(to) };
    } else if (from) {
      where.date = { gte: parseDateOnly(from) };
    }

    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id, regionId);
      where.employeeId = { in: managedIds };
    } else {
      if (employeeId) where.employeeId = employeeId;
      if (regionId) where.regionId = regionId;
    }

    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { subArea: "asc" }],
    });
    res.json(schedules);
  })
);

// 新增單筆排班
router.post(
  "/",
  requireCapability("MANAGE_SCHEDULE", "REGION_MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, subArea, note, employeeId, regionId } = parsed.data;

    // REGION_MANAGER 只能排自己管轄的員工
    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      if (!managedIds.includes(employeeId)) {
        return res.status(403).json({ error: "您只能為自己區域內的員工排班" });
      }
    }

    const schedule = await prisma.schedule.create({
      data: {
        date: parseDateOnly(date),
        subArea,
        note: note || null,
        employeeId,
        regionId: regionId || null,
        createdById: req.user!.id,
      },
      include: {
        employee: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(schedule);
  })
);

// 批次新增排班（同天多人）
router.post(
  "/bulk",
  requireCapability("MANAGE_SCHEDULE", "REGION_MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, subArea, note, employeeIds, regionId } = parsed.data;

    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      const forbidden = employeeIds.filter((id) => !managedIds.includes(id));
      if (forbidden.length > 0) {
        return res.status(403).json({ error: "您只能為自己區域內的員工排班" });
      }
    }

    const parsedDate = parseDateOnly(date);
    const data = employeeIds.map((eid) => ({
      date: parsedDate,
      subArea,
      note: note || null,
      employeeId: eid,
      regionId: regionId || null,
      createdById: req.user!.id,
    }));

    const result = await prisma.schedule.createMany({ data, skipDuplicates: false });
    res.status(201).json({ created: result.count });
  })
);

// 修改排班
router.put(
  "/:id",
  requireCapability("MANAGE_SCHEDULE", "REGION_MANAGER"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.schedule.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "找不到此排班紀錄" });

    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      if (!managedIds.includes(existing.employeeId)) {
        return res.status(403).json({ error: "您只能修改自己區域內員工的排班" });
      }
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { subArea, note, date } = parsed.data;

    const updated = await prisma.schedule.update({
      where: { id: req.params.id },
      data: {
        ...(subArea !== undefined && { subArea }),
        ...(note !== undefined && { note: note || null }),
        ...(date !== undefined && { date: parseDateOnly(date) }),
      },
      include: {
        employee: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    res.json(updated);
  })
);

// 刪除排班
router.delete(
  "/:id",
  requireCapability("MANAGE_SCHEDULE", "REGION_MANAGER"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.schedule.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "找不到此排班紀錄" });

    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id);
      if (!managedIds.includes(existing.employeeId)) {
        return res.status(403).json({ error: "您只能刪除自己區域內員工的排班" });
      }
    }

    await prisma.schedule.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
