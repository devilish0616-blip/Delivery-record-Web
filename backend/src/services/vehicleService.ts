import { prisma } from "../lib/prisma";
import { VehicleType } from "@prisma/client";

// 各車型預設保養項目（項目名稱 + 里程週期 km + 時間週期 天，先到先提醒）
export const DEFAULT_MAINTENANCE_ITEMS: Record<
  VehicleType,
  { itemName: string; intervalKm: number; intervalDays: number | null }[]
> = {
  MOTORCYCLE: [
    { itemName: "機油", intervalKm: 1000, intervalDays: 90 },
    { itemName: "齒輪油", intervalKm: 3000, intervalDays: 180 },
    { itemName: "空氣濾芯", intervalKm: 5000, intervalDays: 365 },
    { itemName: "皮帶", intervalKm: 12000, intervalDays: null },
  ],
  TRUCK: [
    { itemName: "機油", intervalKm: 1000, intervalDays: 90 },
    { itemName: "輪胎", intervalKm: 40000, intervalDays: null },
    { itemName: "煞車來令片", intervalKm: 20000, intervalDays: null },
  ],
};

// 距離下次保養剩餘里程低於週期的此比例時，視為提醒（黃燈）
const WARNING_RATIO = 0.2;
// 證件／稅務到期前幾天內視為即將到期（黃燈）
const DOC_WARNING_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export interface MaintenanceItemStatus {
  id: string;
  itemName: string;
  intervalKm: number;
  intervalDays: number | null;
  lastChangeMileage: number;
  lastChangeNote: string | null;
  lastChangeAt: string | null;
  sinceLastChange: number;
  remaining: number; // 剩餘里程
  remainingDays: number | null; // 剩餘天數（若有設定時間週期）
  needsChange: boolean;
  warning: boolean;
}

export type DocumentKey =
  | "insuranceCompulsoryExpiry"
  | "insuranceLiabilityExpiry"
  | "inspectionExpiry"
  | "licenseTaxDueDate"
  | "fuelTaxDueDate";

export interface DocumentStatus {
  key: DocumentKey;
  label: string;
  date: string | null;
  daysUntil: number | null;
  expired: boolean;
  expiring: boolean;
}

export const DOCUMENT_LABELS: Record<DocumentKey, string> = {
  insuranceCompulsoryExpiry: "強制險",
  insuranceLiabilityExpiry: "第三人責任險",
  inspectionExpiry: "驗車",
  licenseTaxDueDate: "牌照稅",
  fuelTaxDueDate: "燃料稅",
};

export interface VehicleStatus {
  id: string;
  plateNumber: string;
  type: VehicleType;
  note: string | null;
  isActive: boolean;
  currentMileage: number;
  insuranceCompulsoryExpiry: string | null;
  insuranceLiabilityExpiry: string | null;
  inspectionExpiry: string | null;
  licenseTaxDueDate: string | null;
  fuelTaxDueDate: string | null;
  maintenanceItems: MaintenanceItemStatus[];
  documents: DocumentStatus[];
  needsMaintenance: boolean;
  maintenanceWarning: boolean;
  documentExpired: boolean;
  documentExpiring: boolean;
  openRepairCount: number;
}

function buildDocumentStatus(
  key: DocumentKey,
  value: Date | null,
  now: Date
): DocumentStatus {
  if (!value) {
    return { key, label: DOCUMENT_LABELS[key], date: null, daysUntil: null, expired: false, expiring: false };
  }
  const daysUntil = daysBetween(now, value);
  return {
    key,
    label: DOCUMENT_LABELS[key],
    date: value.toISOString(),
    daysUntil,
    expired: daysUntil < 0,
    expiring: daysUntil >= 0 && daysUntil <= DOC_WARNING_DAYS,
  };
}

export async function getVehicleStatus(vehicleId: string): Promise<VehicleStatus | null> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { maintenanceItems: { orderBy: { createdAt: "asc" } } },
  });
  if (!vehicle) return null;

  const now = new Date();
  const currentMileage = vehicle.currentMileage;

  const maintenanceItems: MaintenanceItemStatus[] = vehicle.maintenanceItems.map((item) => {
    const sinceLastChange = Math.max(0, currentMileage - item.lastChangeMileage);
    const remaining = item.intervalKm - sinceLastChange;
    const kmNeeds = sinceLastChange >= item.intervalKm;
    const kmWarning = remaining < item.intervalKm * WARNING_RATIO;

    // 時間週期：以上次更換時間為基準，未曾更換則以建立時間為基準
    let remainingDays: number | null = null;
    let daysNeeds = false;
    let daysWarning = false;
    if (item.intervalDays && item.intervalDays > 0) {
      const base = item.lastChangeAt ?? item.createdAt;
      const elapsedDays = daysBetween(base, now);
      remainingDays = item.intervalDays - elapsedDays;
      daysNeeds = remainingDays <= 0;
      daysWarning = remainingDays < item.intervalDays * WARNING_RATIO;
    }

    return {
      id: item.id,
      itemName: item.itemName,
      intervalKm: item.intervalKm,
      intervalDays: item.intervalDays,
      lastChangeMileage: item.lastChangeMileage,
      lastChangeNote: item.lastChangeNote,
      lastChangeAt: item.lastChangeAt ? item.lastChangeAt.toISOString() : null,
      sinceLastChange,
      remaining,
      remainingDays,
      needsChange: kmNeeds || daysNeeds,
      warning: kmWarning || daysWarning,
    };
  });

  const documents: DocumentStatus[] = [
    buildDocumentStatus("insuranceCompulsoryExpiry", vehicle.insuranceCompulsoryExpiry, now),
    buildDocumentStatus("insuranceLiabilityExpiry", vehicle.insuranceLiabilityExpiry, now),
    buildDocumentStatus("inspectionExpiry", vehicle.inspectionExpiry, now),
    buildDocumentStatus("licenseTaxDueDate", vehicle.licenseTaxDueDate, now),
    buildDocumentStatus("fuelTaxDueDate", vehicle.fuelTaxDueDate, now),
  ];

  const openRepairCount = await prisma.repairRequest.count({
    where: { vehicleId: vehicle.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
  });

  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    type: vehicle.type,
    note: vehicle.note,
    isActive: vehicle.isActive,
    currentMileage,
    insuranceCompulsoryExpiry: vehicle.insuranceCompulsoryExpiry?.toISOString() ?? null,
    insuranceLiabilityExpiry: vehicle.insuranceLiabilityExpiry?.toISOString() ?? null,
    inspectionExpiry: vehicle.inspectionExpiry?.toISOString() ?? null,
    licenseTaxDueDate: vehicle.licenseTaxDueDate?.toISOString() ?? null,
    fuelTaxDueDate: vehicle.fuelTaxDueDate?.toISOString() ?? null,
    maintenanceItems,
    documents,
    needsMaintenance: maintenanceItems.some((m) => m.needsChange),
    maintenanceWarning: maintenanceItems.some((m) => m.warning),
    documentExpired: documents.some((d) => d.expired),
    documentExpiring: documents.some((d) => d.expiring),
    openRepairCount,
  };
}

export async function listVehicleStatuses(): Promise<VehicleStatus[]> {
  const vehicles = await prisma.vehicle.findMany({ orderBy: { plateNumber: "asc" } });
  return Promise.all(vehicles.map((v) => getVehicleStatus(v.id) as Promise<VehicleStatus>));
}
