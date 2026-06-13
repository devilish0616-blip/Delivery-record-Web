import { prisma } from "../lib/prisma";

export const OIL_CHANGE_INTERVAL_KM = 1000;
export const OIL_CHANGE_WARNING_REMAINING_KM = 200;

export interface VehicleStatus {
  id: string;
  plateNumber: string;
  note: string | null;
  isActive: boolean;
  lastOilChangeMileage: number;
  currentMileage: number;
  sinceLastOilChange: number;
  remainingToOilChange: number;
  needsOilChange: boolean;
  oilChangeWarning: boolean;
}

// 取得車輛目前累計里程：取該車所有里程紀錄中最大的「結束里程」
export async function getCurrentMileage(vehicleId: string): Promise<number> {
  const latest = await prisma.mileageRecord.aggregate({
    where: { vehicleId },
    _max: { endMileage: true },
  });
  return latest._max.endMileage ?? 0;
}

export async function getVehicleStatus(vehicleId: string): Promise<VehicleStatus | null> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return null;

  const currentMileage = await getCurrentMileage(vehicleId);
  const sinceLastOilChange = Math.max(0, currentMileage - vehicle.lastOilChangeMileage);
  const remainingToOilChange = OIL_CHANGE_INTERVAL_KM - sinceLastOilChange;

  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    note: vehicle.note,
    isActive: vehicle.isActive,
    lastOilChangeMileage: vehicle.lastOilChangeMileage,
    currentMileage,
    sinceLastOilChange,
    remainingToOilChange,
    needsOilChange: sinceLastOilChange >= OIL_CHANGE_INTERVAL_KM,
    oilChangeWarning: remainingToOilChange < OIL_CHANGE_WARNING_REMAINING_KM,
  };
}

export async function listVehicleStatuses(): Promise<VehicleStatus[]> {
  const vehicles = await prisma.vehicle.findMany({ orderBy: { plateNumber: "asc" } });
  return Promise.all(vehicles.map((v) => getVehicleStatus(v.id) as Promise<VehicleStatus>));
}
