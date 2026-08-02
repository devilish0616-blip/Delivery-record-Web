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
  vehicleId?: string | null; // 加油／停車費專用：帶入時依車輛分組用
  vehicleLabel?: string | null; // 對應車牌，無車輛時為 null
  employeeId?: string; // 加油／停車費／薪資專用：對應 User.id，用來查負責關係人
  resolvedPartyId?: string | null; // 依 employeeId 解析出的負責關係人；查無指派為 null
  reason?: string | null; // 僅「已略過」清單項目會帶此欄位
}

export interface ImportBlockStatus {
  sourceCount: number; // 該月來源總筆數
  sourceTotal: number; // 該月來源總金額
  importedCount: number; // 已帶入筆數
  importedTotal: number; // 已帶入金額（以帶入當下金額計）
  pending: ImportSourceItem[]; // 未帶入清單（不含已標記不帶入者）
  pendingTotal: number;
  ignored: ImportSourceItem[]; // 已標記「不帶入」，不再出現於待帶入清單
  ignoredTotal: number;
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

// 已標記「不帶入」的來源（見 FinanceIgnoredSource），這些項目不再出現於待帶入清單
async function getIgnoredMap(sourceType: FinanceSourceType, sourceIds: string[]) {
  if (sourceIds.length === 0) return new Map<string, { reason: string | null }>();
  const rows = await prisma.financeIgnoredSource.findMany({
    where: { sourceType, sourceId: { in: sourceIds } },
    select: { sourceId: true, reason: true },
  });
  return new Map(rows.map((r) => [r.sourceId, { reason: r.reason }]));
}

// 帶入中心：員工（User.id）→ 指派的負責關係人（見 User.responsiblePartyId），未指派者不在回傳結果中
async function getResponsiblePartyMap(userIds: string[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, responsiblePartyId: true },
  });
  return new Map(users.map((u) => [u.id, u.responsiblePartyId]));
}

function buildBlock(
  items: ImportSourceItem[],
  linked: Map<string, { amountAtLink: number }>,
  ignored: Map<string, { reason: string | null }>,
  defaultPartyId: string | null,
  extra?: Record<string, unknown>
): ImportBlockStatus {
  const pending = items.filter((i) => !linked.has(i.sourceId) && !ignored.has(i.sourceId));
  const ignoredItems = items
    .filter((i) => !linked.has(i.sourceId) && ignored.has(i.sourceId))
    .map((i) => ({ ...i, reason: ignored.get(i.sourceId)!.reason }));
  let importedTotal = 0;
  for (const i of items) {
    const link = linked.get(i.sourceId);
    if (link) importedTotal += link.amountAtLink;
  }
  return {
    sourceCount: items.length,
    sourceTotal: items.reduce((s, i) => s + i.amount, 0),
    importedCount: items.length - pending.length - ignoredItems.length,
    importedTotal,
    pending,
    pendingTotal: pending.reduce((s, i) => s + i.amount, 0),
    ignored: ignoredItems,
    ignoredTotal: ignoredItems.reduce((s, i) => s + i.amount, 0),
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
    vehicleId: r.vehicleId,
    vehicleLabel: r.vehicle?.plateNumber ?? null,
    employeeId: r.employeeId,
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
    vehicleId: r.vehicleId,
    vehicleLabel: r.vehicle?.plateNumber ?? null,
    employeeId: r.employeeId,
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
          employeeId: s.userId,
        };
      })
      .filter((i) => i.amount > 0);
  }

  // 依員工指派的負責關係人（見 User.responsiblePartyId），標記每筆項目的預設入帳關係人
  const responsibleMap = await getResponsiblePartyMap(
    [...fuelItems, ...parkingItems, ...salaryItems]
      .map((i) => i.employeeId)
      .filter((id): id is string => Boolean(id))
  );
  const withResolvedParty = (items: ImportSourceItem[]) =>
    items.map((i) => ({
      ...i,
      resolvedPartyId: i.employeeId ? responsibleMap.get(i.employeeId) ?? null : null,
    }));
  const fuelItemsResolved = withResolvedParty(fuelItems);
  const parkingItemsResolved = withResolvedParty(parkingItems);
  const salaryItemsResolved = withResolvedParty(salaryItems);

  const [
    fuelLinked,
    parkingLinked,
    maintenanceLinked,
    salaryLinked,
    fuelIgnored,
    parkingIgnored,
    maintenanceIgnored,
    salaryIgnored,
    warnings,
  ] = await Promise.all([
    getLinkedMap("FUEL_REPORT", fuelItems.map((i) => i.sourceId)),
    getLinkedMap("PARKING_FEE_REPORT", parkingItems.map((i) => i.sourceId)),
    getLinkedMap("MAINTENANCE_LOG", maintenanceItems.map((i) => i.sourceId)),
    getLinkedMap("SALARY_SNAPSHOT", salaryItems.map((i) => i.sourceId)),
    getIgnoredMap("FUEL_REPORT", fuelItems.map((i) => i.sourceId)),
    getIgnoredMap("PARKING_FEE_REPORT", parkingItems.map((i) => i.sourceId)),
    getIgnoredMap("MAINTENANCE_LOG", maintenanceItems.map((i) => i.sourceId)),
    getIgnoredMap("SALARY_SNAPSHOT", salaryItems.map((i) => i.sourceId)),
    getSourceWarnings(year, month),
  ]);

  return {
    year,
    month,
    fuel: buildBlock(fuelItemsResolved, fuelLinked, fuelIgnored, settings?.fuelPartyId ?? null),
    parking: buildBlock(parkingItemsResolved, parkingLinked, parkingIgnored, settings?.parkingPartyId ?? null),
    maintenance: buildBlock(
      maintenanceItems,
      maintenanceLinked,
      maintenanceIgnored,
      settings?.maintenancePartyId ?? null
    ),
    salary: buildBlock(salaryItemsResolved, salaryLinked, salaryIgnored, settings?.salaryPartyId ?? null, {
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

// ─── 略過來源（標記「不帶入」，之後不再出現於待帶入清單） ────────────────────────

// 標記／更新略過原因：已帶入的來源不可略過（應改由記帳頁刪除該帳目）
export async function ignoreSource(
  sourceType: FinanceSourceType,
  sourceId: string,
  reason: string | null,
  userId: string
): Promise<void> {
  const linked = await prisma.financeSourceLink.findUnique({
    where: { sourceType_sourceId: { sourceType, sourceId } },
  });
  if (linked) throw new ImportError("此筆已帶入帳本，如需排除請先於記帳頁刪除該帳目");

  await prisma.financeIgnoredSource.upsert({
    where: { sourceType_sourceId: { sourceType, sourceId } },
    create: { sourceType, sourceId, reason, ignoredById: userId },
    update: { reason, ignoredById: userId },
  });
}

// 還原：移除略過標記，該筆重新出現於待帶入清單
export async function unignoreSource(sourceType: FinanceSourceType, sourceId: string): Promise<void> {
  await prisma.financeIgnoredSource.deleteMany({ where: { sourceType, sourceId } });
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

// 加油／停車費：該月未帶入的核准紀錄彙總成支出，逐筆連結防重複
// 依「解析出的負責關係人」分組（見 ImportSourceItem.resolvedPartyId）：已指派負責關係人的員工各自獨立一筆，
// partyOverrides（sourceId → partyId）可針對單筆覆蓋（帶入中心逐筆下拉選單），優先權最高；
// 其餘未指派者落入 fallback（呼叫傳入的 partyId，或全域預設值）合併一筆；
// sourceIds 未提供時帶入該月全部待帶入項目，提供時僅帶入勾選的項目（帶入中心逐筆勾選）
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
  },
  partyOverrides?: Record<string, string>,
  sourceIds?: string[]
) {
  const status = await getImportCenterStatus(year, month);
  const block = config.sourceType === "FUEL_REPORT" ? status.fuel : status.parking;
  if (block.pending.length === 0) {
    throw new ImportError(`該月已沒有未帶入的${config.noteLabel}`);
  }
  const itemsToImport = sourceIds ? block.pending.filter((i) => sourceIds.includes(i.sourceId)) : block.pending;
  if (itemsToImport.length === 0) {
    throw new ImportError("找不到指定的來源，請重新整理帶入中心後再試");
  }

  const settings = await prisma.financeSettings.findUnique({ where: { id: 1 } });
  const fallbackPartyId = partyId ?? settings?.[config.defaultPartyKey] ?? null;
  const category = await findOrCreateCategory(FinanceCategoryKind.EXPENSE, config.categoryName);
  const monthLabel = `${year}/${String(month).padStart(2, "0")}`;

  const groups = new Map<string, ImportSourceItem[]>();
  for (const item of itemsToImport) {
    const resolved = partyOverrides?.[item.sourceId] ?? item.resolvedPartyId ?? fallbackPartyId;
    if (!resolved) {
      throw new ImportError(`「${item.label}」尚未指派負責關係人，請先於帳務設定指派，或選擇一個入帳關係人`);
    }
    const list = groups.get(resolved) ?? [];
    list.push(item);
    groups.set(resolved, list);
  }

  // 在交易外先驗證每個分組解析出的關係人都存在，交易內只負責建立記錄
  const groupPartyIds = Array.from(groups.keys());
  const parties = await prisma.financeParty.findMany({ where: { id: { in: groupPartyIds } } });
  if (parties.length !== groupPartyIds.length) throw new ImportError("找不到指定的關係人");

  try {
    return await prisma.$transaction(async (tx) => {
      const records = [];
      for (const [groupPartyId, items] of groups) {
        const total = items.reduce((s, i) => s + i.amount, 0);
        const vehicleLabels = Array.from(
          new Set(items.map((i) => i.vehicleLabel).filter((v): v is string => Boolean(v)))
        );
        const labelSuffix = vehicleLabels.length > 0 ? ` ${vehicleLabels.join("、")}` : "";
        const note = `帶入 ${monthLabel}${labelSuffix} 已核准${config.noteLabel}共 ${items.length} 筆`;
        const record = await tx.financeRecord.create({
          data: {
            date: monthEndDate(year, month),
            type: "EXPENSE",
            partyId: groupPartyId,
            categoryId: category.id,
            amount: total,
            note,
            sourceType: config.sourceType,
            createdById,
          },
        });
        await tx.financeSourceLink.createMany({
          data: items.map((i) => ({
            recordId: record.id,
            sourceType: config.sourceType,
            sourceId: i.sourceId,
            amountAtLink: i.amount,
            sourceLabel: `${i.date} ${i.label} ${fmt(i.amount)}`,
          })),
        });
        records.push(record);
      }
      return records;
    });
  } catch (err) {
    rethrowDuplicate(err);
  }
}

export function importFuelReports(
  year: number,
  month: number,
  partyId: string | undefined,
  createdById: string,
  partyOverrides?: Record<string, string>,
  sourceIds?: string[]
) {
  return importAggregated(
    year,
    month,
    partyId,
    createdById,
    { sourceType: "FUEL_REPORT", categoryName: IMPORT_CATEGORY_NAMES.fuel, noteLabel: "加油回報", defaultPartyKey: "fuelPartyId" },
    partyOverrides,
    sourceIds
  );
}

export function importParkingFeeReports(
  year: number,
  month: number,
  partyId: string | undefined,
  createdById: string,
  partyOverrides?: Record<string, string>,
  sourceIds?: string[]
) {
  return importAggregated(
    year,
    month,
    partyId,
    createdById,
    { sourceType: "PARKING_FEE_REPORT", categoryName: IMPORT_CATEGORY_NAMES.parking, noteLabel: "停車費回報", defaultPartyKey: "parkingPartyId" },
    partyOverrides,
    sourceIds
  );
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
// 各員工依 User.responsiblePartyId 指派各自解析入帳關係人；partyOverrides（snapshotId → partyId）可逐筆覆蓋，
// 優先權最高；其餘未指派者落入 fallback（傳入的 partyId 或全域預設值）
export async function importSalarySnapshots(
  year: number,
  month: number,
  snapshotIds: string[],
  partyId: string | undefined,
  createdById: string,
  partyOverrides?: Record<string, string>
) {
  const lock = await getSalaryMonthLock(year, month);
  if (!lock) throw new ImportError("該月份薪資尚未封存，請先於薪資頁完成封存再帶入");

  const settings = await prisma.financeSettings.findUnique({ where: { id: 1 } });
  const fallbackPartyId = partyId ?? settings?.salaryPartyId ?? null;
  const category = await findOrCreateCategory(FinanceCategoryKind.EXPENSE, IMPORT_CATEGORY_NAMES.salary);

  const snapshots = await prisma.salarySnapshot.findMany({
    where: { id: { in: snapshotIds }, year, month },
  });
  if (snapshots.length === 0) throw new ImportError("找不到可帶入的薪資快照");

  const responsibleMap = await getResponsiblePartyMap(snapshots.map((s) => s.userId));

  type SnapshotData = {
    userName?: string;
    totalSalary?: number;
    fuelAllowance?: number;
    parkingFeeAllowance?: number;
    totalSalaryExcludingSubsidy?: number;
  };

  const toCreate: { snapshot: (typeof snapshots)[number]; data: SnapshotData; amount: number; partyId: string }[] = [];
  for (const s of snapshots) {
    const data = s.data as SnapshotData;
    const amount = computeSalaryImportAmount(data);
    if (amount <= 0) continue;
    const resolved = partyOverrides?.[s.id] ?? responsibleMap.get(s.userId) ?? fallbackPartyId;
    if (!resolved) {
      throw new ImportError(
        `「${data.userName ?? "員工"}」尚未指派負責關係人，請先於帳務設定指派，或選擇一個入帳關係人`
      );
    }
    toCreate.push({ snapshot: s, data, amount, partyId: resolved });
  }
  if (toCreate.length === 0) throw new ImportError("勾選的薪資快照金額皆為 0，無可帶入項目");

  // 在交易外先驗證每個解析出的關係人都存在，交易內只負責建立記錄
  const uniquePartyIds = Array.from(new Set(toCreate.map((c) => c.partyId)));
  const parties = await prisma.financeParty.findMany({ where: { id: { in: uniquePartyIds } } });
  if (parties.length !== uniquePartyIds.length) throw new ImportError("找不到指定的關係人");

  const today = parseDateOnly(toDateOnlyString(new Date()));

  try {
    return await prisma.$transaction(async (tx) => {
      const created = [];
      for (const { snapshot: s, data, amount, partyId: resolvedPartyId } of toCreate) {
        const label = `${data.userName ?? "員工"}${month}月薪資`;
        const record = await tx.financeRecord.create({
          data: {
            date: today,
            type: "EXPENSE",
            partyId: resolvedPartyId,
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
      return created;
    });
  } catch (err) {
    rethrowDuplicate(err);
  }
}

// ─── 一鍵帶入本月（薪資＋油資＋停車費） ──────────────────────────────────────
// 油資／停車費補貼已內含於員工薪資一併發放給員工，但薪資帶入金額（computeSalaryImportAmount）
// 已扣除這兩項補貼，改由油資／停車費回報各自入帳，兩者相加＝實際支出，不會重複計帳。
// 這裡只是把「薪資／油資／停車費」三個各自獨立、各自防重複的帶入動作合併成一次點擊，
// 沿用各自的預設關係人；維修履歷需逐筆勾選分類與關係人，不含在一鍵帶入內。
export interface QuickImportBlockResult {
  imported: boolean;
  count: number;
  totalAmount: number;
  error: string | null; // 帶入失敗原因（例：尚未設定預設關係人）
  skipReason: string | null; // 略過原因（例：薪資尚未封存、本月無待帶入項目）
}

export interface QuickImportMaintenancePendingInfo {
  count: number;
  totalAmount: number;
}

export interface QuickImportResult {
  salary: QuickImportBlockResult;
  fuel: QuickImportBlockResult;
  parking: QuickImportBlockResult;
  maintenancePending: QuickImportMaintenancePendingInfo; // 唯讀提示：一鍵帶入不含維修履歷，需另外逐筆帶入
}

export async function quickImportMonth(
  year: number,
  month: number,
  createdById: string
): Promise<QuickImportResult> {
  const status = await getImportCenterStatus(year, month);

  async function run(
    pending: ImportSourceItem[],
    pendingTotal: number,
    skipReason: string | null,
    action: () => Promise<unknown>
  ): Promise<QuickImportBlockResult> {
    if (skipReason) {
      return { imported: false, count: 0, totalAmount: 0, error: null, skipReason };
    }
    if (pending.length === 0) {
      return { imported: false, count: 0, totalAmount: 0, error: null, skipReason: "本月無待帶入項目" };
    }
    try {
      await action();
      return { imported: true, count: pending.length, totalAmount: pendingTotal, error: null, skipReason: null };
    } catch (err) {
      const message = err instanceof ImportError ? err.message : "帶入失敗";
      return { imported: false, count: 0, totalAmount: 0, error: message, skipReason: null };
    }
  }

  const salaryLocked = Boolean((status.salary.extra as { monthLocked?: boolean } | undefined)?.monthLocked);

  const salary = await run(
    status.salary.pending,
    status.salary.pendingTotal,
    salaryLocked ? null : "該月份薪資尚未封存",
    () =>
      importSalarySnapshots(
        year,
        month,
        status.salary.pending.map((i) => i.sourceId),
        undefined,
        createdById
      )
  );
  const fuel = await run(status.fuel.pending, status.fuel.pendingTotal, null, () =>
    importFuelReports(year, month, undefined, createdById)
  );
  const parking = await run(status.parking.pending, status.parking.pendingTotal, null, () =>
    importParkingFeeReports(year, month, undefined, createdById)
  );

  const maintenancePending: QuickImportMaintenancePendingInfo = {
    count: status.maintenance.pending.length,
    totalAmount: status.maintenance.pendingTotal,
  };

  return { salary, fuel, parking, maintenancePending };
}
