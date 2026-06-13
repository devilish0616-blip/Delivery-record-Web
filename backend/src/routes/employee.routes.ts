import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
router.use(requireAuth, requireAdmin);

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
        createdAt: true,
      },
    });
    res.json(users);
  })
);

const roleSchema = z.object({ role: z.enum(["ADMIN", "EMPLOYEE"]) });

// 設定員工角色（員工 / 管理者）
router.patch(
  "/:id/role",
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

export default router;
