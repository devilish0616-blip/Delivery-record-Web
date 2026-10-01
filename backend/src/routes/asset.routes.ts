import { Router } from "express";
import { AssetCategory, FinanceCategoryKind, Prisma, type Asset } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, toDateOnlyString } from "../utils/date";
import { findOrCreateCategory } from "../services/financeService";
import {
  DEFAULT_LIFE_YEARS,
  assetStatusAt,
  bookValueAt,
  defaultSalvage,
  depreciatedMonths,
  disposalGain,
  installmentAmounts,
  installmentDueDate,
  installmentsInMonth,
  lifeMonths,
  loanMismatch,
  loanPrincipal,
  loanProgressAt,
  loanSourceId,
  monthlyDepreciation,
} from "../services/assetService";

const router = Router();
router.use(requireAuth, requireAdminOrManager);

const LOAN_CATEGORY_NAME = "車貸";

const include = { vehicle: { select: { id: true, plateNumber: true, type: true, isActive: true } } };
type AssetWithVehicle = Asset & { vehicle: { id: string; plateNumber: string; type: string; isActive: boolean } | null };

// 列表與明細共用的計算結果（金額皆為截至今天）
function present(a: AssetWithVehicle, now: Date) {
  const progress = loanProgressAt(a, now);
  return {
    id: a.id,
    name: a.name,
    category: a.category,
    vehicle: a.vehicle,
    acquiredDate: toDateOnlyString(a.acquiredDate),
    cost: a.cost,
    usefulLifeYears: a.usefulLifeYears,
    salvageValue: a.salvageValue,
    note: a.note,
    hasLoan: a.hasLoan,
    downPayment: a.downPayment,
    lender: a.lender,
    monthlyPayment: a.monthlyPayment,
    termCount: a.termCount,
    firstPaymentMonth: a.firstPaymentDate ? toDateOnlyString(a.firstPaymentDate).slice(0, 7) : null,
    paymentDay: a.paymentDay,
    settledDate: a.settledDate ? toDateOnlyString(a.settledDate) : null,
    settleAmount: a.settleAmount,
    disposedDate: a.disposedDate ? toDateOnlyString(a.disposedDate) : null,
    disposalAmount: a.disposalAmount,
    disposalNote: a.disposalNote,
    // 計算欄位
    status: assetStatusAt(a, now),
    bookValue: bookValueAt(a, now),
    monthlyDepreciation: monthlyDepreciation(a),
    depreciatedMonths: depreciatedMonths(a, now),
    lifeMonths: lifeMonths(a),
    disposalGain: disposalGain(a),
    loan: a.hasLoan
      ? {
          principal: loanPrincipal(a),
          mismatch: loanMismatch(a),
          lastAmount: installmentAmounts(a).at(-1) ?? null,
          paidCount: progress?.paidCount ?? 0,
          remaining: progress?.remaining ?? 0,
          nextNo: progress?.nextNo ?? null,
          nextDueDate: progress?.nextDueDate ? toDateOnlyString(progress.nextDueDate) : null,
          nextAmount: progress?.nextAmount ?? null,
          lastDueDate: a.termCount ? toDateOnlyString(installmentDueDate(a, a.termCount)) : null,
        }
      : null,
  };
}

function today(): Date {
  return parseDateOnly(toDateOnlyString(new Date()));
}

// 資產清單＋總覽數字（已處分的資產不計入總覽）
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const now = today();
    const assets = await prisma.asset.findMany({ include, orderBy: [{ acquiredDate: "desc" }] });
    const list = assets.map((a) => present(a, now));
    const held = list.filter((a) => a.status !== "DISPOSED");
    res.json({
      assets: list,
      summary: {
        count: held.length,
        totalCost: held.reduce((s, a) => s + a.cost, 0),
        bookValue: held.reduce((s, a) => s + a.bookValue, 0),
        loanRemaining: held.reduce((s, a) => s + (a.loan?.remaining ?? 0), 0),
        loanActiveCount: held.filter((a) => a.status === "LOAN").length,
      },
    });
  })
);

// 尚未建立資產卡的車輛（新增資產時選車用）
router.get(
  "/available-vehicles",
  asyncHandler(async (_req, res) => {
    const vehicles = await prisma.vehicle.findMany({
      where: { asset: null },
      select: { id: true, plateNumber: true, type: true, isActive: true },
      orderBy: { plateNumber: "asc" },
    });
    res.json(vehicles);
  })
);

// ─── 本月應繳（零利率分期）與帶入記帳 ──────────────────────────────────────────

async function listDues(year: number, month: number) {
  const assets = await prisma.asset.findMany({ where: { hasLoan: true }, include });
  const items = assets.flatMap((a) =>
    installmentsInMonth(a, year, month).map((i) => ({
      assetId: a.id,
      assetName: a.name,
      category: a.category,
      lender: a.lender,
      installmentNo: i.no,
      termCount: a.termCount!,
      dueDate: toDateOnlyString(i.dueDate),
      amount: i.amount,
      isLast: i.isLast,
      sourceId: loanSourceId(a.id, i.no),
    }))
  );
  const links = items.length
    ? await prisma.financeSourceLink.findMany({
        where: { sourceType: "LOAN_PAYMENT", sourceId: { in: items.map((i) => i.sourceId) } },
        select: { sourceId: true, recordId: true },
      })
    : [];
  const linked = new Map(links.map((l) => [l.sourceId, l.recordId]));
  return items
    .map((i) => ({ ...i, recordId: linked.get(i.sourceId) ?? null }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function parseYearMonth(q: Record<string, unknown>) {
  const now = new Date();
  const year = Number(q.year) || now.getUTCFullYear();
  const month = Number(q.month) || now.getUTCMonth() + 1;
  if (month < 1 || month > 12) throw Object.assign(new Error("月份須為 1-12"), { status: 400 });
  return { year, month };
}

router.get(
  "/dues",
  asyncHandler(async (req, res) => {
    const { year, month } = parseYearMonth(req.query);
    const [items, settings] = await Promise.all([
      listDues(year, month),
      prisma.financeSettings.findUnique({ where: { id: 1 } }),
    ]);
    res.json({ year, month, items, defaultPartyId: settings?.loanPartyId ?? null });
  })
);

const importSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  partyId: z.string().optional(),
  sourceIds: z.array(z.string().min(1)).min(1, "請選擇要帶入的期數"),
});

// 把勾選的分期帶入記帳：每期一筆「車貸」支出，FinanceSourceLink 鎖住同一期只能帶入一次
router.post(
  "/dues/import",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { year, month, sourceIds } = parsed.data;
    const settings = await prisma.financeSettings.findUnique({ where: { id: 1 } });
    const partyId = parsed.data.partyId ?? settings?.loanPartyId ?? null;
    if (!partyId) return res.status(400).json({ error: "請選擇付款人（入帳關係人）" });
    const party = await prisma.financeParty.findUnique({ where: { id: partyId } });
    if (!party) return res.status(400).json({ error: "找不到指定的關係人" });

    const dues = await listDues(year, month);
    const picked = dues.filter((d) => sourceIds.includes(d.sourceId));
    if (picked.length !== sourceIds.length) {
      return res.status(400).json({ error: "部分期數不屬於這個月份，請重新整理後再試" });
    }
    if (picked.some((d) => d.recordId)) {
      return res.status(409).json({ error: "部分期數已經帶入過，請重新整理後再試" });
    }

    const category = await findOrCreateCategory(FinanceCategoryKind.EXPENSE, LOAN_CATEGORY_NAME);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const out = [];
        for (const d of picked) {
          const record = await tx.financeRecord.create({
            data: {
              date: parseDateOnly(d.dueDate),
              type: "EXPENSE",
              partyId: party.id,
              categoryId: category.id,
              amount: d.amount,
              note: `車貸・${d.assetName} 第 ${d.installmentNo}/${d.termCount} 期${d.lender ? `（${d.lender}）` : ""}`,
              sourceType: "LOAN_PAYMENT",
              createdById: req.user!.id,
            },
          });
          await tx.financeSourceLink.create({
            data: {
              recordId: record.id,
              sourceType: "LOAN_PAYMENT",
              sourceId: d.sourceId,
              amountAtLink: d.amount,
              sourceLabel: `${d.assetName} 第 ${d.installmentNo}/${d.termCount} 期`,
            },
          });
          out.push(record);
        }
        return out;
      });
      res.status(201).json({ created: created.length });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "部分期數已經帶入過，請重新整理後再試" });
      }
      throw err;
    }
  })
);

// ─── 單筆資產 ────────────────────────────────────────────────────────────────

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const a = await prisma.asset.findUnique({ where: { id: req.params.id }, include });
    if (!a) return res.status(404).json({ error: "找不到此資產" });
    const now = today();

    // 分期明細（含是否已帶入記帳）
    const amounts = installmentAmounts(a);
    const links = amounts.length
      ? await prisma.financeSourceLink.findMany({
          where: { sourceType: "LOAN_PAYMENT", sourceId: { startsWith: `${a.id}:` } },
          select: { sourceId: true },
        })
      : [];
    const imported = new Set(links.map((l) => l.sourceId));
    const progress = loanProgressAt(a, now);
    const schedule = amounts.map((amount, i) => {
      const no = i + 1;
      const due = installmentDueDate(a, no);
      const cancelled = Boolean(a.settledDate && due.getTime() >= a.settledDate.getTime());
      return {
        no,
        dueDate: toDateOnlyString(due),
        amount,
        paid: !cancelled && no <= (progress?.paidCount ?? 0),
        cancelled,
        imported: imported.has(loanSourceId(a.id, no)),
      };
    });

    // 持有成本：取自車輛的維修履歷與已核准的加油／停車費回報（自取得日起）
    let ownership: { maintenance: number; insurance: number; other: number; fuel: number; parking: number } | null = null;
    if (a.vehicleId) {
      const since = { gte: a.acquiredDate };
      const [logs, fuel, parking] = await Promise.all([
        prisma.maintenanceLog.groupBy({
          by: ["category"],
          where: { vehicleId: a.vehicleId, date: since },
          _sum: { cost: true },
        }),
        prisma.fuelReport.aggregate({ where: { vehicleId: a.vehicleId, status: "APPROVED", date: since }, _sum: { amount: true } }),
        prisma.parkingFeeReport.aggregate({ where: { vehicleId: a.vehicleId, status: "APPROVED", date: since }, _sum: { amount: true } }),
      ]);
      const byCat = new Map(logs.map((l) => [l.category, l._sum.cost ?? 0]));
      ownership = {
        maintenance: byCat.get("MAINTENANCE") ?? 0,
        insurance: byCat.get("INSURANCE") ?? 0,
        other: byCat.get("OTHER") ?? 0,
        fuel: fuel._sum.amount ?? 0,
        parking: parking._sum.amount ?? 0,
      };
    }

    res.json({ ...present(a, now), schedule, ownership });
  })
);

const monthRe = /^\d{4}-\d{2}$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const assetSchema = z
  .object({
    name: z.string().trim().min(1, "請輸入資產名稱"),
    category: z.nativeEnum(AssetCategory),
    vehicleId: z.string().min(1).nullable().optional(),
    acquiredDate: z.string().regex(dateRe, "請選擇取得日期"),
    cost: z.number().positive("總價必須大於 0"),
    usefulLifeYears: z.number().int().min(1, "耐用年數至少 1 年").max(50).optional(),
    salvageValue: z.number().min(0, "殘值不可為負數").optional(),
    note: z.string().trim().nullable().optional(),
    hasLoan: z.boolean(),
    downPayment: z.number().min(0, "頭期款不可為負數").optional(),
    lender: z.string().trim().nullable().optional(),
    monthlyPayment: z.number().positive("每期金額必須大於 0").nullable().optional(),
    termCount: z.number().int().min(1, "期數至少 1 期").max(120).nullable().optional(),
    firstPaymentMonth: z.string().regex(monthRe, "請選擇首期月份").nullable().optional(),
    paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.salvageValue !== undefined && v.salvageValue > v.cost) {
      ctx.addIssue({ code: "custom", message: "殘值不可大於總價" });
    }
    if (v.hasLoan) {
      if (!v.monthlyPayment || !v.termCount || !v.firstPaymentMonth || !v.paymentDay) {
        ctx.addIssue({ code: "custom", message: "分期付款請填每期金額、期數、首期月份與每月繳款日" });
      }
      if ((v.downPayment ?? 0) >= v.cost) ctx.addIssue({ code: "custom", message: "頭期款必須小於總價" });
    }
  });

function toData(v: z.infer<typeof assetSchema>) {
  const years = v.usefulLifeYears ?? DEFAULT_LIFE_YEARS[v.category];
  return {
    name: v.name,
    category: v.category,
    vehicleId: v.vehicleId ?? null,
    acquiredDate: parseDateOnly(v.acquiredDate),
    cost: v.cost,
    usefulLifeYears: years,
    salvageValue: v.salvageValue ?? defaultSalvage(v.cost, years),
    note: v.note || null,
    hasLoan: v.hasLoan,
    downPayment: v.hasLoan ? v.downPayment ?? 0 : 0,
    lender: v.hasLoan ? v.lender || null : null,
    monthlyPayment: v.hasLoan ? v.monthlyPayment ?? null : null,
    termCount: v.hasLoan ? v.termCount ?? null : null,
    firstPaymentDate: v.hasLoan && v.firstPaymentMonth ? parseDateOnly(`${v.firstPaymentMonth}-01`) : null,
    paymentDay: v.hasLoan ? v.paymentDay ?? null : null,
  };
}

function vehicleTaken(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = assetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    try {
      const a = await prisma.asset.create({ data: toData(parsed.data), include });
      res.status(201).json(present(a, today()));
    } catch (err) {
      if (vehicleTaken(err)) return res.status(400).json({ error: "這台車已經有資產卡了" });
      throw err;
    }
  })
);

router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = assetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "找不到此資產" });
    try {
      const a = await prisma.asset.update({ where: { id: req.params.id }, data: toData(parsed.data), include });
      res.json(present(a, today()));
    } catch (err) {
      if (vehicleTaken(err)) return res.status(400).json({ error: "這台車已經有資產卡了" });
      throw err;
    }
  })
);

// 刪除資產卡（已帶入記帳的車貸帳目保留，來源連結顯示為資產已刪除）
router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "找不到此資產" });
    await prisma.asset.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

const settleSchema = z.object({
  date: z.string().regex(dateRe, "請選擇結清日期"),
  amount: z.number().min(0, "結清金額不可為負數"),
});

// 提前結清：結清日之後的期數不再列為應繳
router.post(
  "/:id/settle",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = settleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const a = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!a) return res.status(404).json({ error: "找不到此資產" });
    if (!a.hasLoan) return res.status(400).json({ error: "這筆資產沒有分期" });
    const updated = await prisma.asset.update({
      where: { id: a.id },
      data: { settledDate: parseDateOnly(parsed.data.date), settleAmount: parsed.data.amount },
      include,
    });
    res.json(present(updated, today()));
  })
);

router.delete(
  "/:id/settle",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updated = await prisma.asset.update({
      where: { id: req.params.id },
      data: { settledDate: null, settleAmount: null },
      include,
    });
    res.json(present(updated, today()));
  })
);

const disposeSchema = z.object({
  date: z.string().regex(dateRe, "請選擇處分日期"),
  amount: z.number().min(0, "處分金額不可為負數"),
  note: z.string().trim().nullable().optional(),
});

// 處分（出售／報廢）：處分當月為最後一個折舊月，處分損益＝處分金額−帳面價值
router.post(
  "/:id/dispose",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = disposeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const a = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!a) return res.status(404).json({ error: "找不到此資產" });
    const date = parseDateOnly(parsed.data.date);
    if (date.getTime() < a.acquiredDate.getTime()) return res.status(400).json({ error: "處分日期不可早於取得日期" });
    const updated = await prisma.asset.update({
      where: { id: a.id },
      data: { disposedDate: date, disposalAmount: parsed.data.amount, disposalNote: parsed.data.note || null },
      include,
    });
    res.json(present(updated, today()));
  })
);

router.delete(
  "/:id/dispose",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updated = await prisma.asset.update({
      where: { id: req.params.id },
      data: { disposedDate: null, disposalAmount: null, disposalNote: null },
      include,
    });
    res.json(present(updated, today()));
  })
);

export default router;
