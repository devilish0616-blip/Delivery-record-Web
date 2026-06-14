import { prisma } from "../lib/prisma";

interface MileageLike {
  id: string;
  vehicleId: string;
  date: Date;
  endMileage: number;
}

// 為每筆里程紀錄計算「當日行駛里程」= 該紀錄的結束里程 - 同車輛前一筆紀錄的結束里程
// 若該車輛無更早的紀錄，distance 為 null（無法計算）
export async function withDistances<T extends MileageLike>(
  records: T[]
): Promise<(T & { distance: number | null })[]> {
  const vehicleIds = Array.from(new Set(records.map((r) => r.vehicleId)));
  if (vehicleIds.length === 0) {
    return records.map((r) => ({ ...r, distance: null }));
  }

  const allRecords = await prisma.mileageRecord.findMany({
    where: { vehicleId: { in: vehicleIds } },
    select: { id: true, vehicleId: true, endMileage: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const distanceById = new Map<string, number | null>();
  const lastByVehicle = new Map<string, number>();
  for (const r of allRecords) {
    const prevMileage = lastByVehicle.get(r.vehicleId);
    distanceById.set(r.id, prevMileage === undefined ? null : r.endMileage - prevMileage);
    lastByVehicle.set(r.vehicleId, r.endMileage);
  }

  return records.map((r) => ({ ...r, distance: distanceById.get(r.id) ?? null }));
}

// 取得指定車輛在某日期之前最近一筆紀錄的結束里程，用於新增紀錄時的合理性檢查
export async function getPreviousMileage(
  vehicleId: string,
  date: Date,
  excludeId?: string
): Promise<number | null> {
  const prev = await prisma.mileageRecord.findFirst({
    where: {
      vehicleId,
      date: { lt: date },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { endMileage: true },
  });
  return prev?.endMileage ?? null;
}
