import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager, ALL_CAPABILITIES } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  name: z.string().min(1, "請輸入職務名稱"),
  allowance: z.number().nonnegative("加給金額不得為負"),
  capabilities: z.array(z.enum(ALL_CAPABILITIES)).default([]),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

function serialize(p: {
  id: string;
  name: string;
  allowance: number;
  capabilities: Prisma.JsonValue;
  isActive: boolean;
  sortOrder: number;
  _count?: { members: number };
}) {
  return {
    id: p.id,
    name: p.name,
    allowance: p.allowance,
    capabilities: Array.isArray(p.capabilities) ? (p.capabilities as string[]) : [],
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    memberCount: p._count?.members ?? 0,
  };
}

// 職務清單（ADMIN/MANAGER 可讀，供員工管理指派下拉與職務設定使用）
router.get(
  "/",
  requireAdminOrManager,
  asyncHandler(async (_req, res) => {
    const positions = await prisma.jobPosition.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { members: true } } },
    });
    res.json(positions.map(serialize));
  })
);

// 新增職務（僅 ADMIN）
router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { name, allowance, capabilities, isActive, sortOrder } = parsed.data;
    const position = await prisma.jobPosition.create({
      data: {
        name,
        allowance,
        capabilities,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0,
      },
      include: { _count: { select: { members: true } } },
    });
    res.status(201).json(serialize(position));
  })
);

// 編輯職務（僅 ADMIN）
router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const existing = await prisma.jobPosition.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "找不到指定職務" });
    }
    const { name, allowance, capabilities, isActive, sortOrder } = parsed.data;
    const position = await prisma.jobPosition.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(allowance !== undefined ? { allowance } : {}),
        ...(capabilities !== undefined ? { capabilities } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
      include: { _count: { select: { members: true } } },
    });
    res.json(serialize(position));
  })
);

// 刪除職務（僅 ADMIN）；已指派此職務的員工會自動解除指派（FK SetNull）
router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.jobPosition.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "找不到指定職務" });
    }
    await prisma.jobPosition.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

export default router;
