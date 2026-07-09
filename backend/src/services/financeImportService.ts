// 記帳模組：帶入中心
// 四種來源（加油回報／停車費回報／維修履歷／薪資封存）帶入帳本：
//  - 來源紀錄永遠不自動入帳，一律預覽後手動確認
//  - FinanceSourceLink @@unique([sourceType, sourceId]) 鎖死，同一筆來源只能帶入一次
//  - 帶入後來源變動不默改帳本，僅回報警告由使用者決定

import { FinanceCategoryKind, FinanceSourceType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { parseDateOnly, startOfMonth, startOfNextMonth, toDateOnlyString } from "../utils/date";
import {
  computeSalaryImportAmount,
  findOrCreateCategory,
  IMPORT_CATEGORY_NAMES,
} from "./financeService";
import { getSalaryMonthLock } from "./salaryService";

// ─── 帶入中心狀態查詢 ─────────────────────────────────────────────────────────

export interface ImportSourceItem {
  sourceId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  label: string; // 摘要（員工／車牌／項目）
  note: string | null;
  categoryName?: string; // 維修履歷專用：對應入帳分類
}

export interface ImportBlockStatus {
  sourceCount: number; // 該月來源總筆數
  sourceTotal: number; // 該月來源總金額
  importedCount: number; // 已帶入筆數
  importedTotal: number; // 已帶入金額（以帶入當下金額計）
  pending: ImportSourceItem[]; // 未帶入清單
  pendingTotal: number;
  defaultPartyId: string | null;
  extra?: Record<string, unknown>;
}

export interface SourceWarning {
  recordId: string;
  recordNote: string | null;
  sourceType: FinanceSourceType;
  sourceLabel: string | null;
  message: string; // 例：來源金額已變更（帶入 $500 → 目前 $600）
}

export interface ImportCenterStatus {
  year: number;
  month: number;
  fuel: ImportBlockStatus;
  parking: ImportBlockStatus;
  maintenance: ImportBlockStatus;
  salary: ImportBlockStatus;
  warnings: SourceWarning[];
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

async function getLinkedMap(sourceType: FinanceSourceType, sourceIds: string[]) {
  if (sourceIds.length === 0) return new Map<string, { amountAtLink: number }>();
  const links = await prisma.financeSourceLink.findMany({
    where: { sourceType, sourceId: { in: sourceIds } },
    select: { sourceId: true, amountAtLink: true },
  });
  return new Map(links.map((l) => [l.sourceId, { amountAtLink: l.amountAtLink }]));
}

function buildBlock(
  items: ImportSourceItem[],
  linked: Map<string, { amountAtLink: number }>,
  defaultPartyId: string | null,
  extra?: Record<string, unknown>
): ImportBlockStatus {
  const pending = items.filter((i) => !linked.has(i.sourceId));
  let importedTotal = 0;
  for (const i of items) {
    const link = linked.get(i.sourceId);
    if (link) importedTotal += link.amountAtLink;
  }
  return {
    sourceCount: items.length,
    sourceTotal: items.reduce((s, i) => s + i.amount, 0),
    importedCount: items.length - pending.length,
    importedTotal,
    pending,
    pendingTotal: pending.reduce((s, i) => s + i.amount, 0),
    defaultPartyId,
    ...(extra ? { extra } : {}),
  };
}

export async function getImportCenterStatus(year: number, month: number): Promise<ImportCenterStatus> {
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const settings = await prisma.financeSettings.findUnique({ where: { id: 1 } });

  // 已核准加油回報
  const fuelReports = await prisma.fuelReport.findMany({
    where: { status: "APPROVED", date: { gte: monthStart, lt: monthEnd } },
    include: { employee: { select: { name: true } }, vehicle: { select: { plateNumber: true } } },
    orderBy: { date: "asc" },
  });
  const fuelItems: ImportSourceItem[] = fuelReports.map((r) => ({
    sourceId: r.id,
    date: toDateOnlyString(r.date),
    amount: r.amount,
    label: `${r.employee.name}${r.vehicle ? `／${r.vehicle.plateNumber}` : ""}`,
    note: r.note,
  }));

  // 已核准停車費回報
  const parkingReports = await prisma.parkingFeeReport.findMany({
    where: { status: "APPROVED", date: { gte: monthStart, lt: monthEnd } },
    include: { employee: { select: { name: true } }, vehicle: { select: { plateNumber: true } } },
    orderBy: { date: "asc" },
  });
  const parkingItems: ImportSourceItem[] = parkingReports.map((r) => ({
    sourceId: r.id,
    date: toDateOnlyString(r.date),
    amount: r.amount,
    label: `${r.employee.name}${r.vehicle ? `／${r.vehicle.plateNumber}` : ""}`,
    note: r.note,
  }));

  // 有費用的維修履歷
  const maintenanceLogs = await prisma.maintenanceLog.findMany({
    where: { cost: { gt: 0 }, date: { gte: monthStart, lt: monthEnd } },
    include: { vehicle: { select: { plateNumber: true } } },
    orderBy: { date: "asc" },
  });
  const maintenanceItems: ImportSourceItem[] = maintenanceLogs.map((l) => ({
    sourceId: l.id,
    date: toDateOnlyString(l.date),
    amount: l.cost,
    label: `${l.vehicle.plateNumber}／${l.itemName}${l.vendor ? `（${l.vendor}）` : ""}`,
    note: l.note,
    categoryName: IMPORT_CATEGORY_NAMES.maintenance[l.category] ?? "雜支",
  }));

  // 薪資封存快照（僅限已封存月份）
  const lock = await getSalaryMonthLock(year, month);
  let salaryItems: ImportSourceItem[] = [];
  if (lock) {
    const snapshots = await prisma.salarySnapshot.findMany({ where: { year, month } });
    salaryItems = snapshots
      .map((s) => {
        const data = s.data as {
          userName?: string;
          totalSalary?: number;
          fuelAllowance?: number;
          parkingFeeAllowance?: number;
          totalSalaryExcludingSubsidy?: number;
        };
        return {
          sourceId: s.id,
          date: toDateOnlyString(s.updatedAt),
          amount: computeSalaryImportAmount(data),
          label: `${data.userName ?? "員工"}${month}月薪資`,
          note: `薪資總額 ${fmt(data.totalSalary ?? 0)}，扣除油資補貼 ${fmt(
            data.fuelAllowance ?? 0
          )}、停車費補貼 ${fmt(data.parkingFeeAllowance ?? 0)}`,
        };
      })
      .filter((i) => i.amount > 0);
  }

  const [fuelLinked, parkingLinked, maintenanceLinked, salaryLinked, warnings] = await Promise.all([
    getLinkedMap("FUEL_REPORT", fuelItems.map((i) => i.sourceId)),
    getLinkedMap("PARKING_FEE_REPORT", parkingItems.map((i) => i.sourceId)),
    getLinkedMap("MAINTENANCE_LOG", maintenanceItems.map((i) => i.sourceId)),
    getLinkedMap("SALARY_SNAPSHOT", salaryItems.map((i) => i.sourceId)),
    getSourceWarnings(year, month),
  ]);

  return {
    year,
    month,
    fuel: buildBlock(fuelItems, fuelLinked, settings?.fuelPartyId ?? null),
    parking: buildBlock(parkingItems, parkingLinked, settings?.parkingPartyId ?? null),
    maintenance: buildBlock(maintenanceItems, maintenanceLinked, settings?.maintenancePartyId ?? null),
    salary: buildBlock(salaryItems, salaryLinked, settings?.salaryPartyId ?? null, {
      monthLocked: Boolean(lock),
    }),
    warnings,
  };
}

// ─── 來源變動偵測：帳目在該月、其連結的來源已變動或消失 ─────────────────────────

async function getSourceWarnings(year: number, month: number): Promise<SourceWarning[]> {
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);

  const records = await prisma.financeRecord.findMany({
    where: { date: { gte: monthStart, lt: monthEnd }, sourceLinks: { some: {} } },
    include: { sourceLinks: true },
  });
  if (records.length === 0) return [];

  const linksByType = new Map<FinanceSourceType, { recordId: string; recordNote: string | null; link: (typeof records)[number]["sourceLinks"][number] }[]>();
  for (const r of records) {
    for (const link of r.sourceLinks) {
      const list = linksByType.get(link.sourceType) ?? [];
      list.push({ recordId: r.id, recordNote: r.note, link });
      linksByType.set(link.sourceType, list);
    }
  }

  const warnings: SourceWarning[] = [];
  const push = (
    entry: { recordId: string; recordNote: string | null; link: { sourceType: FinanceSourceType; sourceLabel: string | null } },
    message: string
  ) =>
    warnings.push({
      recordId: entry.recordId,
      recordNote: entry.recordNote,
      sourceType: entry.link.sourceType,
      sourceLabel: entry.link.sourceLabel,
      message,
    });

  for (const [type, entries] of linksByType) {
    const ids = entries.map((e) => e.link.sourceId);

    if (type === "FUEL_REPORT" || type === "PARKING_FEE_REPORT") {
      const rows =
        type === "FUEL_REPORT"
          ? await prisma.fuelReport.findMany({
              where: { id: { in: ids } },
              select: { id: true, amount: true, status: true },
            })
          : await prisma.parkingFeeReport.findMany({
              where: { id: { in: ids } },
              select: { id: true, amount: true, status: true },
            });
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const e of entries) {
        const src = byId.get(e.link.sourceId);
        if (!src) push(e, "來源紀錄已被刪除");
        else if (src.status !== "APPROVED") push(e, "來源已非核准狀態（核准被撤銷或駁回）");
        else if (src.amount !== e.link.amountAtLink)
          push(e, `來源金額已變更（帶入 ${fmt(e.link.amountAtLink)} → 目前 ${fmt(src.amount)}）`);
      }
    } else if (type === "MAINTENANCE_LOG") {
      const rows = await prisma.maintenanceLog.findMany({
        where: { id: { in: ids } },
        select: { id: true, cost: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const e of entries) {
        const src = byId.get(e.link.sourceId);
        if (!src) push(e, "維修履歷已被刪除");
        else if (src.cost !== e.link.amountAtLink)
          push(e, `維修費用已變更（帶入 ${fmt(e.link.amountAtLink)} → 目前 ${fmt(src.cost)}）`);
      }
    } else if (type === "SALARY_SNAPSHOT") {
      const rows = await prisma.salarySnapshot.findMany({
        where: { id: { in: ids } },
        select: { id: true, data: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const e of entries) {
        const src = byId.get(e.link.sourceId);
        if (!src) push(e, "薪資封存快照已不存在（月份可能已解除封存）");
        else {
          const amount = computeSalaryImportAmount(src.data as Record<string, number>);
          if (amount !== e.link.amountAtLink)
            push(e, `薪資快照金額已變更（帶入 ${fmt(e.link.amountAtLink)} → 目前 ${fmt(amount)}）`);
        }
      }
    }
    // IMPORT / MANUAL 不做來源比對
  }

  return warnings;
}

// ─── 帶入執行 ────────────────────────────────────────────────────────────────

class ImportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function monthEndDate(year: number, month: number): Date {
  // 該月最後一天 00:00 UTC，作為彙總帳目的入帳日期
  return new Date(Date.UTC(year, month, 0));
}

async function resolveParty(partyId: string | undefined, fallbackId: string | null) {
  const id = partyId ?? fallbackId;
  if (!id) throw new ImportError("請選擇入帳關係人");
  const party = await prisma.financeParty.findUnique({ where: { id } });
  if (!party) throw new ImportError("找不到指定的關係人");
  return party;
}

// 唯一衝突（來源已被帶入）轉成 409，讓前端提示重新整理
function rethrowDuplicate(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ImportError("部分來源紀錄已被帶入過，請重新整理帶入中心後再試", 409);
  }
  throw err;
}

// 加油／停車費：該月未帶入的核准紀錄彙總成一筆支出，逐筆連結防重複
async function importAggregated(
  year: number,
  month: number,
  partyId: string | undefined,
  createdById: string,
  config: {
    sourceType: Extract<FinanceSourceType, "FUEL_REPORT" | "PARKING_FEE_REPORT">;
    categoryName: string;
    noteLabel: string; // 例：加油回報
    defaultPartyKey: "fuelPartyId" | "parkingPartyId";
  }
) {
  const status = await getImportCenterStatus(year, month);
  const block = config.sourceType === "FUEL_REPORT" ? status.fuel : status.parking;
  if (block.pending.length === 0) {
    throw new ImportError(`該月已沒有未帶入的${config.noteLabel}`);
  }

  const settings = await prisma.financeSettings.findUnique({ where: { id: 1 } });
  const party = await resolveParty(partyId, settings?.[config.defaultPartyKey] ?? null);
  const category = await findOrCreateCategory(FinanceCategoryKind.EXPENSE, config.categoryName);

  const total = block.pendingTotal;
  const note = `帶入 ${year}/${String(month).padStart(2, "0")} 已核准${config.noteLabel}共 ${
    block.pending.length
  } 筆`;

  try {
    return await prisma.$transaction(async (tx) => {
      const record = await tx.financeRecord.create({
        data: {
          date: monthEndDate(year, month),
          type: "EXPENSE",
          partyId: party.id,
          categoryId: category.id,
          amount: total,
          note,
          sourceType: config.sourceType,
          createdById,
        },
      });
      await tx.financeSourceLink.createMany({
        data: block.pending.map((i) => ({
          recordId: record.id,
          sourceType: config.sourceType,
          sourceId: i.sourceId,
          amountAtLink: i.amount,
          sourceLabel: `${i.date} ${i.label} ${fmt(i.amount)}`,
        })),
      });
      return record;
    });
  } catch (err) {
    rethrowDuplicate(err);
  }
}

export function importFuelReports(year: number, month: number, partyId: string | undefined, createdById: string) {
  return importAggregated(year, month, partyId, createdById, {
    sourceType: "FUEL_REPORT",
    categoryName: IMPORT_CATEGORY_NAMES.fuel,
    noteLabel: "加油回報",
    defaultPartyKey: "fuelPartyId",
  });
}

export function importParkingFeeReports(year: number, month: number, partyId: string | undefined, createdById: string) {
  return importAggregated(year, month, partyId, createdById, {
    sourceType: "PARKING_FEE_REPORT",
    categoryName: IMPORT_CATEGORY_NAMES.parking,
    noteLabel: "停車費回報",
    defaultPartyKey: "parkingPartyId",
  });
}

// 維修履歷：逐筆勾選帶入，一筆履歷一筆帳（分類依履歷類別對應 維修／保險／雜支）
export async function importMaintenanceLogs(
  year: number,
  month: number,
  logIds: string[],
  partyId: string | undefined,
  createdById: string
) {
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const settings = await prisma.financeSettings.findUnique({ where: { id: 1 } });
  const party = await resolveParty(partyId, settings?.maintenancePartyId ?? null);

  const logs = await prisma.maintenanceLog.findMany({
    where: { id: { in: logIds }, date: { gte: monthStart, lt: monthEnd }, cost: { gt: 0 } },
    include: { vehicle: { select: { plateNumber: true } } },
  });
  if (logs.length === 0) throw new ImportError("找不到可帶入的維修履歷（請確認勾選項目屬於該月且有費用）");

  const categoryIds = new Map<string, string>();
  for (const name of Object.values(IMPORT_CATEGORY_NAMES.maintenance)) {
    if (!categoryIds.has(name)) {
      const c = await findOrCreateCategory(FinanceCategoryKind.EXPENSE, name);
      categoryIds.set(name, c.id);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const created = [];
      for (const log of logs) {
        const categoryName = IMPORT_CATEGORY_NAMES.maintenance[log.category] ?? "雜支";
        const record = await tx.financeRecord.create({
          data: {
            date: log.date,
            type: "EXPENSE",
            partyId: party.id,
            categoryId: categoryIds.get(categoryName)!,
            amount: log.cost,
            note: `${log.vehicle.plateNumber} ${log.itemName}${log.vendor ? `（${log.vendor}）` : ""}`,
            sourceType: "MAINTENANCE_LOG",
            createdById,
          },
        });
        await tx.financeSourceLink.create({
          data: {
            recordId: record.id,
            sourceType: "MAINTENANCE_LOG",
            sourceId: log.id,
            amountAtLink: log.cost,
            sourceLabel: `${toDateOnlyString(log.date)} ${log.vehicle.plateNumber} ${log.itemName}`,
          },
        });
        created.push(record);
      }
      return created;
    });
  } catch (err) {
    rethrowDuplicate(err);
  }
}

// 薪資封存快照：一人一筆（金額＝薪資總額−油資補貼−停車費補貼），僅限已封存月份
export async function importSalarySnapshots(
  year: number,
  month: number,
  snapshotIds: string[],
  partyId: string | undefined,
  createdById: string
) {
  const lock = await getSalaryMonthLock(year, month);
  if (!lock) throw new ImportError("該月份薪資尚未封存，請先於薪資頁完成封存再帶入");

  const settings = await prisma.financeSettings.findUnique({ where: { id: 1 } });
  const party = await resolveParty(partyId, settings?.salaryPartyId ?? null);
  const category = await findOrCreateCategory(FinanceCategoryKind.EXPENSE, IMPORT_CATEGORY_NAMES.salary);

  const snapshots = await prisma.salarySnapshot.findMany({
    where: { id: { in: snapshotIds }, year, month },
  });
  if (snapshots.length === 0) throw new ImportError("找不到可帶入的薪資快照");

  const today = parseDateOnly(toDateOnlyString(new Date()));

  try {
    return await prisma.$transaction(async (tx) => {
      const created = [];
      for (const s of snapshots) {
        const data = s.data as {
          userName?: string;
          totalSalary?: number;
          fuelAllowance?: number;
          parkingFeeAllowance?: number;
          totalSalaryExcludingSubsidy?: number;
        };
        const amount = computeSalaryImportAmount(data);
        if (amount <= 0) continue;
        const label = `${data.userName ?? "員工"}${month}月薪資`;
        const record = await tx.financeRecord.create({
          data: {
            date: today,
            type: "EXPENSE",
            partyId: party.id,
            categoryId: category.id,
            amount,
            note: label,
            sourceType: "SALARY_SNAPSHOT",
            createdById,
          },
        });
        await tx.financeSourceLink.create({
          data: {
            recordId: record.id,
            sourceType: "SALARY_SNAPSHOT",
            sourceId: s.id,
            amountAtLink: amount,
            sourceLabel: label,
          },
        });
        created.push(record);
      }
      if (created.length === 0) throw new ImportError("勾選的薪資快照金額皆為 0，無可帶入項目");
      return created;
    });
  } catch (err) {
    rethrowDuplicate(err);
  }
}
