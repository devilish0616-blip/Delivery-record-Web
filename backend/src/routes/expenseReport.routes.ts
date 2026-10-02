import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, startOfMonth, startOfNextMonth } from "../utils/date";
import { canProxyEnter, checkProxyTarget, proxyTargets } from "../services/proxyEntryService";
import { audit, md, money } from "../services/auditService";

// 加油回報與停車費回報欄位、流程完全相同（員工送出 → 董事長／執行長核准或駁回 → 核准金額計入當月薪資），
// 共用同一套路由，只差資料表與顯示名稱。
// 具代填權限者（同代填送件範圍）可替代管帳號送出，記錄代填者 enteredById
type ExpenseReportKind = "fuel" | "parking";

const LABELS: Record<ExpenseReportKind, string> = {
  fuel: "加油回報",
  parking: "停車費回報",
};

// fuelReport 與 parkingFeeReport 的 Prisma delegate 形狀相同，這裡只宣告用到的方法
interface ExpenseReportDelegate {
  create(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<{ id: string; employeeId: string; enteredById: string | null; status: string; date: Date; amount: number } | null>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
}

function delegateOf(kind: ExpenseReportKind): ExpenseReportDelegate {
  return (kind === "fuel" ? prisma.fuelReport : prisma.parkingFeeReport) as unknown as ExpenseReportDelegate;
}

const createSchema = z.object({
  date: z.string(),
  amount: z.number().positive("金額必須大於 0"),
  note: z.string().optional().nullable(),
  vehicleId: z.string().min(1, "請選擇使用的車輛"),
  employeeId: z.string().optional(), // 代填對象（省略＝本人）
});

const rejectSchema = z.object({
  rejectReason: z.string().min(1, "請填寫駁回原因"),
});

const include = {
  employee: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  enteredBy: { select: { id: true, name: true } },
  vehicle: { select: { id: true, plateNumber: true, type: true } },
};

function monthRange(year?: string, month?: string) {
  if (!year || !month) return undefined;
  const y = Number(year);
  const m = Number(month);
  return { gte: startOfMonth(y, m), lt: startOfNextMonth(y, m) };
}

export function createExpenseReportRouter(kind: ExpenseReportKind) {
  const router = Router();
  const model = delegateOf(kind);
  const label = LABELS[kind];
  router.use(requireAuth);

  // 新增回報：所有登入者可替自己送出；帶 employeeId 為代填（範圍同代填送件）
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
      }
      const { date, amount, note, vehicleId } = parsed.data;
      const employeeId = parsed.data.employeeId || req.user!.id;
      const isProxy = employeeId !== req.user!.id;
      if (isProxy) {
        const denied = await checkProxyTarget(req.user!, employeeId);
        if (denied) return res.status(denied.status).json({ error: denied.error });
      }
      const report = await model.create({
        data: {
          date: parseDateOnly(date),
          amount,
          note: note || null,
          vehicleId: vehicleId || null,
          employeeId,
          enteredById: isProxy ? req.user!.id : null,
        },
        include,
      });
      if (isProxy) {
        await audit(req, { category: "REVIEW", action: "CREATE", summary: `代填${label} ${md(date)} ${money(amount)}`, targetUserId: employeeId });
      }
      res.status(201).json(report);
    })
  );

  // 可代填的對象（董事長帶 scope=all 可選所有啟用中員工）
  router.get(
    "/proxy-targets",
    asyncHandler(async (req, res) => {
      if (!canProxyEnter(req.user!)) return res.status(403).json({ error: "權限不足，需具備代填權限" });
      const users = await proxyTargets(req.user!.role, (req.query as Record<string, string | undefined>).scope);
      res.json(users.filter((u) => u.id !== req.user!.id));
    })
  );

  // 查代填對象的回報
  router.get(
    "/proxy",
    asyncHandler(async (req, res) => {
      const { year, month, employeeId } = req.query as Record<string, string | undefined>;
      if (!employeeId) return res.status(400).json({ error: "請指定員工" });
      const denied = await checkProxyTarget(req.user!, employeeId);
      if (denied) return res.status(denied.status).json({ error: denied.error });
      const date = monthRange(year, month);
      const reports = await model.findMany({
        where: { employeeId, ...(date ? { date } : {}) },
        include,
        orderBy: { date: "desc" },
      });
      res.json(reports);
    })
  );

  // 查自己的回報
  router.get(
    "/my",
    asyncHandler(async (req, res) => {
      const { year, month } = req.query as Record<string, string | undefined>;
      const date = monthRange(year, month);
      const reports = await model.findMany({
        where: { employeeId: req.user!.id, ...(date ? { date } : {}) },
        include,
        orderBy: { date: "desc" },
      });
      res.json(reports);
    })
  );

  // 查所有回報（董事長／執行長）
  router.get(
    "/",
    requireAdminOrManager,
    asyncHandler(async (req, res) => {
      const { year, month, employeeId, status } = req.query as Record<string, string | undefined>;
      const date = monthRange(year, month);
      const reports = await model.findMany({
        where: {
          ...(date ? { date } : {}),
          ...(status ? { status } : {}),
          ...(employeeId ? { employeeId } : {}),
        },
        include,
        orderBy: [{ status: "asc" }, { date: "desc" }],
      });
      res.json(reports);
    })
  );

  // 核准（董事長／執行長）
  router.put(
    "/:id/approve",
    requireAdminOrManager,
    asyncHandler(async (req, res) => {
      const report = await model.findUnique({ where: { id: req.params.id } });
      if (!report) return res.status(404).json({ error: `找不到此${label}` });
      if (report.status !== "PENDING") {
        return res.status(400).json({ error: "僅能審核待審核狀態的回報" });
      }
      const updated = await model.update({
        where: { id: req.params.id },
        data: { status: "APPROVED", reviewedById: req.user!.id, reviewedAt: new Date(), rejectReason: null },
        include,
      });
      await audit(req, {
        category: "REVIEW",
        action: "APPROVE",
        summary: `核准${label} ${md(report.date)} ${money(report.amount)}`,
        targetUserId: report.employeeId,
      });
      res.json(updated);
    })
  );

  // 駁回（董事長／執行長）
  router.put(
    "/:id/reject",
    requireAdminOrManager,
    asyncHandler(async (req, res) => {
      const report = await model.findUnique({ where: { id: req.params.id } });
      if (!report) return res.status(404).json({ error: `找不到此${label}` });
      if (report.status !== "PENDING") {
        return res.status(400).json({ error: "僅能審核待審核狀態的回報" });
      }
      const parsed = rejectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "請填寫駁回原因" });
      }
      const updated = await model.update({
        where: { id: req.params.id },
        data: {
          status: "REJECTED",
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
          rejectReason: parsed.data.rejectReason,
        },
        include,
      });
      await audit(req, {
        category: "REVIEW",
        action: "REJECT",
        summary: `駁回${label} ${md(report.date)} ${money(report.amount)}：${parsed.data.rejectReason}`,
        targetUserId: report.employeeId,
      });
      res.json(updated);
    })
  );

  // 刪除：ADMIN/MANAGER 可刪任何；員工只能撤回自己的或自己代填的 PENDING
  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const report = await model.findUnique({ where: { id: req.params.id } });
      if (!report) return res.status(404).json({ error: `找不到此${label}` });

      const role = req.user!.role;
      if (role !== "ADMIN" && role !== "MANAGER") {
        if (report.employeeId !== req.user!.id && report.enteredById !== req.user!.id) {
          return res.status(403).json({ error: `僅能刪除自己的${label}` });
        }
        if (report.status !== "PENDING") {
          return res.status(400).json({ error: `僅能撤回待審核的${label}` });
        }
      }

      await model.delete({ where: { id: req.params.id } });
      // 本人撤回自己的待審核回報是日常操作，不記
      if (report.employeeId !== req.user!.id || report.status !== "PENDING") {
        const statusText = { PENDING: "待審核", APPROVED: "已核准", REJECTED: "已駁回" }[report.status] ?? report.status;
        await audit(req, {
          category: "REVIEW",
          action: "DELETE",
          summary: `刪除${label} ${md(report.date)} ${money(report.amount)}（${statusText}）`,
          targetUserId: report.employeeId,
        });
      }
      res.status(204).end();
    })
  );

  return router;
}
