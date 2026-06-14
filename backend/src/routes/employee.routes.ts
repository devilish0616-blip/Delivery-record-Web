import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { withDistances } from "../services/mileageService";

const router = Router();
router.use(requireAuth, requireAdminOrManager);

// 管理者：查看所有員工帳號
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        specialTitle: true,
        isActive: true,
        monthlyAllowance: true,
        createdAt: true,
      },
    });
    res.json(users);
  })
);

const roleSchema = z.object({ role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]) });

// 設定員工角色（員工 / 主管 / 管理者）
router.patch(
  "/:id/role",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "請提供有效的角色" });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role },
    });
    res.json(user);
  })
);

const specialTitleSchema = z.object({
  specialTitle: z.enum(["CEO", "SPECIAL"]).nullable(),
});

// 指派特殊職稱：「執行長」或「特殊」（不參與自動判定，固定單價），傳 null 取消
router.patch(
  "/:id/special-title",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = specialTitleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "請提供有效的特殊職稱" });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { specialTitle: parsed.data.specialTitle },
    });
    res.json(user);
  })
);

const statusSchema = z.object({ isActive: z.boolean() });

// 停用/啟用員工帳號
router.patch(
  "/:id/status",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "請提供有效的狀態" });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
    });
    res.json(user);
  })
);

const titleOverrideSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  category: z.enum(["SENIOR", "STAFF", "TEMP"]),
  level: z.enum(["HIGH", "LOW"]).nullable().optional(),
});

// 一般員工職稱每月由系統自動判定，管理者可於此手動覆蓋
router.post(
  "/:id/title-override",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = titleOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, category, level } = parsed.data;

    const override = await prisma.employeeTitleOverride.upsert({
      where: { userId_year_month: { userId: req.params.id, year, month } },
      update: { category, level: level ?? null },
      create: { userId: req.params.id, year, month, category, level: level ?? null },
    });
    res.status(201).json(override);
  })
);

// 需求17：刪除指定的職稱覆蓋紀錄
router.delete(
  "/:id/title-overrides/:overrideId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.employeeTitleOverride.deleteMany({
      where: { id: req.params.overrideId, userId: req.params.id },
    });
    res.status(204).end();
  })
);

const allowanceSchema = z.object({
  monthlyAllowance: z.number().nonnegative(),
});

// 需求11：管理者設定員工固定每月職務加給
router.patch(
  "/:id/allowance",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = allowanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { monthlyAllowance: parsed.data.monthlyAllowance },
    });
    res.json(user);
  })
);

const passwordSchema = z.object({
  password: z.string().min(6, "密碼至少需要 6 個字元"),
});

// 需求12：管理者重設員工密碼
router.put(
  "/:id/password",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash },
    });
    res.json({ success: true });
  })
);

// 需求17：查看指定員工所有歷史紀錄（送件/里程/角色/請假/薪資相關），供管理者清理後刪除帳號
router.get(
  "/:id/records",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true },
    });
    if (!target) {
      return res.status(404).json({ error: "找不到指定員工" });
    }

    const [deliveries, mileages, dailyRoles, leaves, deductions, titleOverrides] = await Promise.all([
      prisma.deliveryRecord.findMany({
        where: { userId: req.params.id },
        orderBy: { date: "desc" },
      }),
      prisma.mileageRecord.findMany({
        where: { userId: req.params.id },
        include: { vehicle: true },
        orderBy: { date: "desc" },
      }),
      prisma.dailyRoleRecord.findMany({
        where: { userId: req.params.id },
        orderBy: { date: "desc" },
      }),
      prisma.leaveRequest.findMany({
        where: { userId: req.params.id },
        orderBy: { date: "desc" },
      }),
      prisma.salaryDeduction.findMany({
        where: { userId: req.params.id },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      prisma.employeeTitleOverride.findMany({
        where: { userId: req.params.id },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
    ]);

    res.json({
      user: target,
      deliveries,
      mileages: await withDistances(mileages),
      dailyRoles,
      leaves,
      deductions,
      titleOverrides,
    });
  })
);

// 需求17：清空指定員工所有歷史紀錄（送件/里程/角色/請假/扣款/職稱覆蓋），供管理者於刪除帳號前使用
router.delete(
  "/:id/records",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ error: "找不到指定員工" });
    }

    await prisma.$transaction([
      prisma.deliveryRecord.deleteMany({ where: { userId: req.params.id } }),
      prisma.mileageRecord.deleteMany({ where: { userId: req.params.id } }),
      prisma.dailyRoleRecord.deleteMany({ where: { userId: req.params.id } }),
      prisma.leaveRequest.deleteMany({ where: { userId: req.params.id } }),
      prisma.salaryDeduction.deleteMany({ where: { userId: req.params.id } }),
      prisma.employeeTitleOverride.deleteMany({ where: { userId: req.params.id } }),
    ]);

    res.status(204).end();
  })
);

// 管理者：刪除員工帳號（僅限尚無任何歷史紀錄的帳號；已有紀錄的帳號請改用停用，避免破壞薪資/紀錄資料）
router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: "無法刪除自己的帳號" });
    }

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ error: "找不到指定員工" });
    }

    const [deliveryCount, mileageCount, roleCount, deductionCount, overrideCount] = await Promise.all([
      prisma.deliveryRecord.count({ where: { userId: req.params.id } }),
      prisma.mileageRecord.count({ where: { userId: req.params.id } }),
      prisma.dailyRoleRecord.count({ where: { userId: req.params.id } }),
      prisma.salaryDeduction.count({ where: { userId: req.params.id } }),
      prisma.employeeTitleOverride.count({ where: { userId: req.params.id } }),
    ]);

    if (deliveryCount + mileageCount + roleCount + deductionCount + overrideCount > 0) {
      return res.status(400).json({
        error: "此帳號已有歷史紀錄（送件/里程/角色/扣款/職稱等），無法直接刪除，請改用「停用帳號」",
      });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
