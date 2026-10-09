import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { LeaveStatus, LeaveType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, toDateOnlyString } from "../utils/date";
import { audit, md } from "../services/auditService";

const router = Router();
router.use(requireAuth);

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  DAY_OFF: "休假",
  PERSONAL: "事假",
  SICK: "病假",
  ANNUAL: "特休",
  OTHER: "其他",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;

// date＝只請一天；startDate＋endDate＝一次請多天（每天各一筆，共用 groupId）
const createSchema = z.object({
  date: z.string().regex(DATE_RE, "日期格式錯誤").optional(),
  startDate: z.string().regex(DATE_RE, "日期格式錯誤").optional(),
  endDate: z.string().regex(DATE_RE, "日期格式錯誤").optional(),
  type: z.nativeEnum(LeaveType).default("OTHER"),
  reason: z.string().trim().max(200).optional().nullable(),
});

function daysInRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(new Date(d));
  return out;
}

// 功能2：新增請假申請（登入者皆可）；同一天已經有請假（待審核或已核准）就跳過那天
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { type } = parsed.data;
    const startStr = parsed.data.startDate ?? parsed.data.date;
    const endStr = parsed.data.endDate ?? startStr;
    if (!startStr || !endStr) return res.status(400).json({ error: "請選擇請假日期" });
    const start = parseDateOnly(startStr);
    const end = parseDateOnly(endStr);
    if (end < start) return res.status(400).json({ error: "結束日期不能早於開始日期" });
    const days = daysInRange(start, end);
    if (days.length > MAX_DAYS) return res.status(400).json({ error: `一次最多請 ${MAX_DAYS} 天` });

    const existing = await prisma.leaveRequest.findMany({
      where: { userId: req.user!.id, date: { gte: start, lte: end }, status: { not: "REJECTED" } },
      select: { date: true },
    });
    const taken = new Set(existing.map((l) => toDateOnlyString(l.date)));
    const toCreate = days.filter((d) => !taken.has(toDateOnlyString(d)));
    if (toCreate.length === 0) {
      return res.status(409).json({ error: days.length === 1 ? "這天已經請過假了" : "這幾天都已經請過假了" });
    }
    const groupId = toCreate.length > 1 ? randomUUID() : null;
    const reason = parsed.data.reason || null;
    await prisma.leaveRequest.createMany({
      data: toCreate.map((date) => ({ userId: req.user!.id, date, type, reason, groupId })),
    });
    const leaves = await prisma.leaveRequest.findMany({
      where: { userId: req.user!.id, date: { in: toCreate }, status: "PENDING" },
      orderBy: { date: "asc" },
    });
    // 頂層保留第一天那筆的欄位（跟以前只請一天時的回應相同），另外附上建立天數與略過的日子
    res.status(201).json({
      ...leaves[0],
      created: toCreate.length,
      skipped: days.filter((d) => taken.has(toDateOnlyString(d))).map(toDateOnlyString),
      leaves,
    });
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

// ADMIN/MANAGER：取得請假紀錄（可用 status 篩選）
router.get(
  "/",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const { status } = req.query as Record<string, string | undefined>;
    const parsedStatus = z.nativeEnum(LeaveStatus).safeParse(status);

    const where: Record<string, unknown> = parsedStatus.success ? { status: parsedStatus.data } : {};

    const leaves = await prisma.leaveRequest.findMany({
      where,
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

const batchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "沒有要審核的請假").max(200),
  action: z.enum(["approve", "reject"]),
});

// ADMIN/MANAGER：一次核准或拒絕多筆（只處理還在待審核的），一次請多天的也是用這個
router.post(
  "/review-batch",
  requireAdminOrManager,
  asyncHandler(async (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { ids, action } = parsed.data;
    const pending = await prisma.leaveRequest.findMany({
      where: { id: { in: ids }, status: "PENDING" },
      include: { user: { select: { name: true } } },
      orderBy: { date: "asc" },
    });
    if (pending.length === 0) return res.status(400).json({ error: "這些請假都已經審核過了" });
    const status = action === "approve" ? "APPROVED" : "REJECTED";
    await prisma.leaveRequest.updateMany({
      where: { id: { in: pending.map((l) => l.id) } },
      data: { status, reviewedBy: req.user!.id, reviewedAt: new Date() },
    });
    // 操作紀錄：每位員工一筆，列出日期
    const byUser = new Map<string, typeof pending>();
    for (const l of pending) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l]);
    for (const [userId, list] of byUser) {
      await audit(req, {
        category: "REVIEW",
        action: action === "approve" ? "APPROVE" : "REJECT",
        summary: `${action === "approve" ? "核准" : "拒絕"}請假 ${list.map((l) => md(l.date)).join("、")}（${list.length} 天）`,
        targetUserId: userId,
      });
    }
    res.json({ updated: pending.length });
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
    if (leave.status !== "PENDING") {
      return res.status(400).json({ error: "這筆請假已經審核過了" });
    }
    const updated = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", reviewedBy: req.user!.id, reviewedAt: new Date() },
    });
    await audit(req, { category: "REVIEW", action: "APPROVE", summary: `核准請假 ${md(leave.date)}`, targetUserId: leave.userId });
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
    if (leave.status !== "PENDING") {
      return res.status(400).json({ error: "這筆請假已經審核過了" });
    }
    const updated = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", reviewedBy: req.user!.id, reviewedAt: new Date() },
    });
    await audit(req, { category: "REVIEW", action: "REJECT", summary: `拒絕請假 ${md(leave.date)}`, targetUserId: leave.userId });
    res.json(updated);
  })
);

// 取消一次請多天的整段（本人只能取消還在待審核的那幾天；董事長可刪除整段）
router.delete(
  "/group/:groupId",
  asyncHandler(async (req, res) => {
    const leaves = await prisma.leaveRequest.findMany({ where: { groupId: req.params.groupId } });
    if (leaves.length === 0) return res.status(404).json({ error: "找不到此請假申請" });
    const isAdmin = req.user!.role === "ADMIN";
    if (!isAdmin && leaves.some((l) => l.userId !== req.user!.id)) {
      return res.status(403).json({ error: "僅能取消自己的請假申請" });
    }
    const removable = isAdmin ? leaves : leaves.filter((l) => l.status === "PENDING");
    if (removable.length === 0) return res.status(400).json({ error: "僅能取消尚未審核的請假申請" });
    await prisma.leaveRequest.deleteMany({ where: { id: { in: removable.map((l) => l.id) } } });
    const owner = leaves[0].userId;
    if (owner !== req.user!.id || removable.some((l) => l.status !== "PENDING")) {
      await audit(req, {
        category: "REVIEW",
        action: "DELETE",
        summary: `刪除請假 ${removable.map((l) => md(l.date)).join("、")}`,
        targetUserId: owner,
      });
    }
    res.json({ deleted: removable.length });
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
    if (leave.userId !== req.user!.id || leave.status !== "PENDING") {
      await audit(req, { category: "REVIEW", action: "DELETE", summary: `刪除請假 ${md(leave.date)}`, targetUserId: leave.userId });
    }
    res.status(204).end();
  })
);

export default router;
