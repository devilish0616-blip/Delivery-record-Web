import { Router } from "express";
import { z } from "zod";
import { LeaveStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  date: z.string(),
  reason: z.string().optional().nullable(),
});

// 功能2：新增請假申請（登入者皆可）
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date, reason } = parsed.data;
    const leave = await prisma.leaveRequest.create({
      data: { userId: req.user!.id, date: parseDateOnly(date), reason: reason || null },
    });
    res.status(201).json(leave);
  })
);

// 取得自己的請假紀錄
router.get(
  "/my",
  asyncHandler(async (req, res) => {
    const leaves = await prisma.leaveRequest.findMany({
      where: { userId: req.user!.id },
      orderBy: { date: "desc" },
    });
    res.json(leaves);
  })
);

// ADMIN/MANAGER：取得所有人的請假紀錄（可用 status 篩選）
router.get(
  "/",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { status } = req.query as Record<string, string | undefined>;
    const parsedStatus = z.nativeEnum(LeaveStatus).safeParse(status);

    const leaves = await prisma.leaveRequest.findMany({
      where: parsedStatus.success ? { status: parsedStatus.data } : {},
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }],
    });

    const reviewerIds = Array.from(
      new Set(leaves.map((l) => l.reviewedBy).filter((id): id is string => !!id))
    );
    const reviewers = reviewerIds.length
      ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } })
      : [];
    const reviewerNameMap = new Map(reviewers.map((r) => [r.id, r.name]));

    res.json(
      leaves.map((l) => ({
        ...l,
        reviewerName: l.reviewedBy ? reviewerNameMap.get(l.reviewedBy) ?? null : null,
      }))
    );
  })
);

// ADMIN/MANAGER：核准請假申請
router.patch(
  "/:id/approve",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!leave) {
      return res.status(404).json({ error: "找不到此請假申請" });
    }
    const updated = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", reviewedBy: req.user!.id, reviewedAt: new Date() },
    });
    res.json(updated);
  })
);

// ADMIN/MANAGER：拒絕請假申請
router.patch(
  "/:id/reject",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!leave) {
      return res.status(404).json({ error: "找不到此請假申請" });
    }
    const updated = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", reviewedBy: req.user!.id, reviewedAt: new Date() },
    });
    res.json(updated);
  })
);

// 取消請假申請（本人且狀態為 PENDING；管理者可刪除任何員工的請假申請，例如需求17清空員工紀錄）
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!leave) {
      return res.status(404).json({ error: "找不到此請假申請" });
    }
    if (req.user!.role !== "ADMIN") {
      if (leave.userId !== req.user!.id) {
        return res.status(403).json({ error: "僅能取消自己的請假申請" });
      }
      if (leave.status !== "PENDING") {
        return res.status(400).json({ error: "僅能取消尚未審核的請假申請" });
      }
    }
    await prisma.leaveRequest.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
