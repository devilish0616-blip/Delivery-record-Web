import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  requireAuth,
  requireAdminOrManager,
  requireAdminManagerOrRegionManager,
  getManagedUserIds,
} from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, toDateOnlyString } from "../utils/date";

const router = Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// ADMIN/MANAGER：區域管理（建立/編輯/停用）
// ---------------------------------------------------------------------------

// 取得所有區域清單（含成員數與主管姓名）
router.get(
  "/",
  requireAdminOrManager,
  asyncHandler(async (_req, res) => {
    const regions = await prisma.region.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    res.json(
      regions.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isActive: r.isActive,
        memberCount: r.members.length,
        managers: r.members.filter((m) => m.isManager).map((m) => ({ id: m.user.id, name: m.user.name })),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    );
  })
);

const createRegionSchema = z.object({
  name: z.string().min(1, "請輸入區域名稱"),
  description: z.string().optional().nullable(),
});

// 建立新區域
router.post(
  "/",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = createRegionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const region = await prisma.region.create({
      data: { name: parsed.data.name, description: parsed.data.description ?? null },
    });
    res.status(201).json(region);
  })
);

const updateRegionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// 編輯區域名稱/說明，或重新啟用已停用的區域
router.put(
  "/:id",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = updateRegionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const region = await prisma.region.findUnique({ where: { id: req.params.id } });
    if (!region) {
      return res.status(404).json({ error: "找不到指定區域" });
    }
    const updated = await prisma.region.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(updated);
  })
);

// 停用區域（軟刪除，保留成員紀錄）
router.delete(
  "/:id",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const region = await prisma.region.findUnique({ where: { id: req.params.id } });
    if (!region) {
      return res.status(404).json({ error: "找不到指定區域" });
    }
    await prisma.region.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// 區域成員管理
// ---------------------------------------------------------------------------

// 取得區域成員清單；區域經理僅可查詢自己負責的區域
router.get(
  "/:id/members",
  requireAdminManagerOrRegionManager,
  asyncHandler(async (req, res) => {
    if (req.user!.role === "REGION_MANAGER") {
      const managedIds = await getManagedUserIds(req.user!.id, req.params.id);
      if (managedIds.length === 0) {
        return res.status(403).json({ error: "您不是此區域的區域經理" });
      }
    }
    const members = await prisma.regionMember.findMany({
      where: { regionId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(
      members.map((m) => ({
        userId: m.user.id,
        userName: m.user.name,
        email: m.user.email,
        role: m.user.role,
        isActive: m.user.isActive,
        isManager: m.isManager,
      }))
    );
  })
);

const addMemberSchema = z.object({ userId: z.string().min(1) });

// 新增成員到區域
router.post(
  "/:id/members",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const region = await prisma.region.findUnique({ where: { id: req.params.id } });
    if (!region) {
      return res.status(404).json({ error: "找不到指定區域" });
    }
    const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) {
      return res.status(404).json({ error: "找不到指定員工" });
    }
    const member = await prisma.regionMember.upsert({
      where: { regionId_userId: { regionId: req.params.id, userId: parsed.data.userId } },
      update: {},
      create: { regionId: req.params.id, userId: parsed.data.userId },
    });
    res.status(201).json(member);
  })
);

// 從區域移除成員
router.delete(
  "/:id/members/:userId",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    await prisma.regionMember.deleteMany({ where: { regionId: req.params.id, userId: req.params.userId } });
    res.status(204).end();
  })
);

const setManagerSchema = z.object({ isManager: z.boolean() });

// 設定/取消該成員為區域主管；連動調整其帳號角色為 REGION_MANAGER / EMPLOYEE
router.patch(
  "/:id/members/:userId/manager",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = setManagerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const member = await prisma.regionMember.findUnique({
      where: { regionId_userId: { regionId: req.params.id, userId: req.params.userId } },
    });
    if (!member) {
      return res.status(404).json({ error: "此員工不是該區域成員" });
    }

    const updated = await prisma.regionMember.update({
      where: { regionId_userId: { regionId: req.params.id, userId: req.params.userId } },
      data: { isManager: parsed.data.isManager },
    });

    if (parsed.data.isManager) {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (user?.role === "EMPLOYEE") {
        await prisma.user.update({ where: { id: req.params.userId }, data: { role: "REGION_MANAGER" } });
      }
    } else {
      const stillManaging = await prisma.regionMember.findFirst({
        where: { userId: req.params.userId, isManager: true },
      });
      if (!stillManaging) {
        const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
        if (user?.role === "REGION_MANAGER") {
          await prisma.user.update({ where: { id: req.params.userId }, data: { role: "EMPLOYEE" } });
        }
      }
    }

    res.json(updated);
  })
);

// ---------------------------------------------------------------------------
// 區域經理：我的區域
// ---------------------------------------------------------------------------

// 取得自己負責的區域與成員列表
router.get(
  "/my",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "REGION_MANAGER") {
      return res.status(403).json({ error: "此操作僅限區域經理" });
    }
    const managedMemberships = await prisma.regionMember.findMany({
      where: { userId: req.user!.id, isManager: true },
      include: {
        region: {
          include: {
            members: { include: { user: { select: { id: true, name: true, role: true, isActive: true } } } },
          },
        },
      },
    });

    const regions = managedMemberships
      .filter((m) => m.region.isActive)
      .map((m) => ({
        id: m.region.id,
        name: m.region.name,
        description: m.region.description,
        members: m.region.members.map((rm) => ({
          userId: rm.user.id,
          userName: rm.user.name,
          role: rm.user.role,
          isActive: rm.user.isActive,
          isManager: rm.isManager,
        })),
      }));

    res.json({ regions });
  })
);

// 取得自己管轄區域成員當日送件狀況、今日角色與是否已填寫
router.get(
  "/my/daily-status",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "REGION_MANAGER") {
      return res.status(403).json({ error: "此操作僅限區域經理" });
    }
    const { date: queryDate, regionId } = req.query as Record<string, string | undefined>;
    const date = queryDate ? parseDateOnly(queryDate) : parseDateOnly(toDateOnlyString(new Date()));

    const managedUserIds = await getManagedUserIds(req.user!.id, regionId);
    if (managedUserIds.length === 0) {
      return res.status(403).json({ error: "您目前沒有管轄的區域" });
    }

    const [users, deliveries, dailyRoles] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: managedUserIds }, isActive: true },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.deliveryRecord.findMany({ where: { userId: { in: managedUserIds }, date } }),
      prisma.dailyRoleRecord.findMany({ where: { userId: { in: managedUserIds }, date } }),
    ]);

    const deliveryMap = new Map(deliveries.map((d) => [d.userId, d]));
    const roleMap = new Map(dailyRoles.map((r) => [r.userId, r.role]));

    res.json({
      date: toDateOnlyString(date),
      members: users.map((u) => {
        const delivery = deliveryMap.get(u.id);
        return {
          userId: u.id,
          userName: u.name,
          hasSubmitted: !!delivery,
          forwardCount: delivery?.forwardCount ?? 0,
          reverseCount: delivery?.reverseCount ?? 0,
          role: roleMap.get(u.id) ?? "NONE",
        };
      }),
    });
  })
);

export default router;
