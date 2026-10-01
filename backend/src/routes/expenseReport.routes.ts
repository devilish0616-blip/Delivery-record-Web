import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, startOfMonth, startOfNextMonth } from "../utils/date";

// 加油回報與停車費回報欄位、流程完全相同（員工送出 → 董事長／執行長核准或駁回 → 核准金額計入當月薪資），
// 共用同一套路由，只差資料表與顯示名稱
type ExpenseReportKind = "fuel" | "parking";

const LABELS: Record<ExpenseReportKind, string> = {
  fuel: "加油回報",
  parking: "停車費回報",
};

// fuelReport 與 parkingFeeReport 的 Prisma delegate 形狀相同，這裡只宣告用到的方法
interface ExpenseReportDelegate {
  create(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<{ id: string; employeeId: string; status: string } | null>;
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
});

const rejectSchema = z.object({
  rejectReason: z.string().min(1, "請填寫駁回原因"),
});

const include = {
  employee: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
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

  // 新增自己的回報（所有登入者皆可）
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
      }
      const { date, amount, note, vehicleId } = parsed.data;
      const report = await model.create({
        data: {
          date: parseDateOnly(date),
          amount,
          note: note || null,
          vehicleId: vehicleId || null,
          employeeId: req.user!.id,
        },
        include,
      });
      res.status(201).json(report);
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
      res.json(updated);
    })
  );

  // 刪除：ADMIN/MANAGER 可刪任何；員工只能撤回自己的 PENDING
  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const report = await model.findUnique({ where: { id: req.params.id } });
      if (!report) return res.status(404).json({ error: `找不到此${label}` });

      const role = req.user!.role;
      if (role !== "ADMIN" && role !== "MANAGER") {
        if (report.employeeId !== req.user!.id) {
          return res.status(403).json({ error: `僅能刪除自己的${label}` });
        }
        if (report.status !== "PENDING") {
          return res.status(400).json({ error: `僅能撤回待審核的${label}` });
        }
      }

      await model.delete({ where: { id: req.params.id } });
      res.status(204).end();
    })
  );

  return router;
}
