import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { salaryFormulaConfigSchema } from "../validation/salaryFormula";
import { audit, diff, flatten, PAY_GRADE_LABELS } from "../services/auditService";

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  name: z.string().min(1, "請輸入職等名稱"),
  config: salaryFormulaConfigSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

function serialize(g: {
  id: string;
  name: string;
  config: Prisma.JsonValue;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  updatedAt: Date;
  updatedBy: string | null;
  _count?: { members: number };
}) {
  return {
    id: g.id,
    name: g.name,
    config: g.config,
    isActive: g.isActive,
    isDefault: g.isDefault,
    sortOrder: g.sortOrder,
    updatedAt: g.updatedAt,
    updatedBy: g.updatedBy,
    memberCount: g._count?.members ?? 0,
  };
}

// 職等清單（ADMIN/MANAGER 可讀，供員工管理指派下拉與職等設定頁使用）
router.get(
  "/",
  requireAdminOrManager,
  asyncHandler(async (_req, res) => {
    const grades = await prisma.payGrade.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { members: true } } },
    });
    res.json(grades.map(serialize));
  })
);

// 新增職等（僅 ADMIN），新增時一律非預設職等，需另外呼叫「設為預設」
router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { name, config, isActive, sortOrder } = parsed.data;
    const grade = await prisma.payGrade.create({
      data: {
        name,
        config: config as Prisma.InputJsonValue,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0,
        updatedBy: req.user!.id,
      },
      include: { _count: { select: { members: true } } },
    });
    await audit(req, { category: "SALARY", action: "CREATE", summary: `新增職等「${grade.name}」` });
    res.status(201).json(serialize(grade));
  })
);

// 編輯職等（僅 ADMIN）
router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const existing = await prisma.payGrade.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "找不到指定職等" });
    }
    const { name, config, isActive, sortOrder } = parsed.data;
    const grade = await prisma.payGrade.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        updatedBy: req.user!.id,
      },
      include: { _count: { select: { members: true } } },
    });
    const changes = [
      ...diff(existing, grade, { name: "名稱", isActive: "啟用" }),
      ...diff(flatten(existing.config), flatten(grade.config), PAY_GRADE_LABELS),
    ];
    if (changes.length) await audit(req, { category: "SALARY", action: "UPDATE", summary: `職等「${grade.name}」`, changes });
    res.json(serialize(grade));
  })
);

// 設為預設職等（僅 ADMIN）：交易內先取消原本的預設，再設定新的，確保永遠恰好一筆
router.patch(
  "/:id/set-default",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.payGrade.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "找不到指定職等" });
    }
    if (!existing.isActive) {
      return res.status(400).json({ error: "停用中的職等無法設為預設，請先啟用" });
    }
    await prisma.$transaction([
      prisma.payGrade.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      prisma.payGrade.update({ where: { id: req.params.id }, data: { isDefault: true } }),
    ]);
    const grade = await prisma.payGrade.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { members: true } } },
    });
    await audit(req, { category: "SALARY", action: "UPDATE", summary: `「${existing.name}」設為預設職等` });
    res.json(serialize(grade!));
  })
);

// 刪除職等（僅 ADMIN）；預設職等不可刪除，已指派此職等的員工會自動改用預設職等（FK SetNull）
router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.payGrade.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "找不到指定職等" });
    }
    if (existing.isDefault) {
      return res.status(400).json({ error: "無法刪除預設職等，請先將其他職等設為預設" });
    }
    await prisma.payGrade.delete({ where: { id: req.params.id } });
    await audit(req, { category: "SALARY", action: "DELETE", summary: `刪除職等「${existing.name}」` });
    res.status(204).send();
  })
);

export default router;
