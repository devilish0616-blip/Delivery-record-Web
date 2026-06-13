import { prisma } from "../lib/prisma";
import { VehicleType } from "@prisma/client";

// 各車型預設保養項目（項目名稱 + 更換週期 km）
export const DEFAULT_MAINTENANCE_ITEMS: Record<VehicleType, { itemName: string; intervalKm: number }[]> = {
  MOTORCYCLE: [
    { itemName: "機油", intervalKm: 1000 },
    { itemName: "齒輪油", intervalKm: 3000 },
    { itemName: "空氣濾芯", intervalKm: 5000 },
    { itemName: "皮帶", intervalKm: 12000 },
  ],
  TRUCK: [{ itemName: "機油", intervalKm: 1000 }],
};

// 距離下次保養剩餘里程低於週期的此比例時，視為提醒
const WARNING_RATIO = 0.2;

export interface MaintenanceItemStatus {
  id: string;
  itemName: string;
  intervalKm: number;
  lastChangeMileage: number;
  lastChangeNote: string | null;
  lastChangeAt: string | null;
  sinceLastChange: number;
  remaining: number;
  needsChange: boolean;
  warning: boolean;
}

export interface VehicleStatus {
  id: string;
  plateNumber: string;
  type: VehicleType;
  note: string | null;
  isActive: boolean;
  currentMileage: number;
  maintenanceItems: MaintenanceItemStatus[];
  needsMaintenance: boolean;
  maintenanceWarning: boolean;
}

export async function getVehicleStatus(vehicleId: string): Promise<VehicleStatus | null> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { maintenanceItems: true },
  });
  if (!vehicle) return null;

  const currentMileage = vehicle.currentMileage;

  const maintenanceItems: MaintenanceItemStatus[] = vehicle.maintenanceItems.map((item) => {
    const sinceLastChange = Math.max(0, currentMileage - item.lastChangeMileage);
    const remaining = item.intervalKm - sinceLastChange;
    return {
      id: item.id,
      itemName: item.itemName,
      intervalKm: item.intervalKm,
      lastChangeMileage: item.lastChangeMileage,
      lastChangeNote: item.lastChangeNote,
      lastChangeAt: item.lastChangeAt ? item.lastChangeAt.toISOString() : null,
      sinceLastChange,
      remaining,
      needsChange: sinceLastChange >= item.intervalKm,
      warning: remaining < item.intervalKm * WARNING_RATIO,
    };
  });

  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    type: vehicle.type,
    note: vehicle.note,
    isActive: vehicle.isActive,
    currentMileage,
    maintenanceItems,
    needsMaintenance: maintenanceItems.some((m) => m.needsChange),
    maintenanceWarning: maintenanceItems.some((m) => m.warning),
  };
}

export async function listVehicleStatuses(): Promise<VehicleStatus[]> {
  const vehicles = await prisma.vehicle.findMany({ orderBy: { plateNumber: "asc" } });
  return Promise.all(vehicles.map((v) => getVehicleStatus(v.id) as Promise<VehicleStatus>));
}
