import { Router } from "express";
import { z } from "zod";
import { DailyRoleType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly } from "../utils/date";
import { getPreviousMileage } from "../services/mileageService";
import { audit, diff, md, roleText, DELIVERY_LABELS } from "../services/auditService";

// 今日收工：員工收工時一次填完當天的角色、送件件數、車輛里程與（選填）加油回報。
// 原本的「送件」「車輛里程」分頁與加油回報照常可用，這裡只是把每天要做的事收成一張表、一次送出。
const router = Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 某天的收工資料：已填的值、上次用的角色與車輛（沿用用）、各車在這天之前的最後里程、這天已報的加油
async function loadDay(userId: string, dateStr: string) {
  const date = parseDateOnly(dateStr);
  const [delivery, role, lastRole, vehicles, dayMileage, recentMileage, fuel] = await Promise.all([
    prisma.deliveryRecord.findUnique({
      where: { userId_date: { userId, date } },
      include: { enteredBy: { select: { name: true } } },
    }),
    prisma.dailyRoleRecord.findUnique({ where: { userId_date: { userId, date } } }),
    prisma.dailyRoleRecord.findFirst({ where: { userId, date: { lt: date } }, orderBy: { date: "desc" } }),
    prisma.vehicle.findMany({
      where: { isActive: true },
      select: { id: true, plateNumber: true, type: true },
      orderBy: { plateNumber: "asc" },
    }),
    prisma.mileageRecord.findMany({ where: { userId, date }, select: { vehicleId: true, endMileage: true } }),
    prisma.mileageRecord.findMany({
      where: { userId, date: { lt: date } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 30,
      select: { vehicleId: true },
    }),
    prisma.fuelReport.findMany({
      where: { employeeId: userId, date },
      orderBy: { createdAt: "asc" },
      select: { id: true, amount: true, status: true, note: true, vehicleId: true },
    }),
  ]);

  const ids = vehicles.map((v) => v.id);
  // 各車在這天之前最後一筆里程（不分是誰填的），用來顯示「上次 xx km」與預估今天開了幾公里
  const previous = ids.length
    ? await prisma.mileageRecord.findMany({
        where: { vehicleId: { in: ids }, date: { lt: date } },
        orderBy: [{ vehicleId: "asc" }, { date: "desc" }, { createdAt: "desc" }],
        distinct: ["vehicleId"],
        select: { vehicleId: true, endMileage: true },
      })
    : [];
  const previousBy = new Map(previous.map((p) => [p.vehicleId, p.endMileage]));
  const typeBy = new Map(vehicles.map((v) => [v.id, v.type]));
  const lastUsed = (type: "MOTORCYCLE" | "TRUCK") =>
    recentMileage.find((m) => typeBy.get(m.vehicleId) === type)?.vehicleId ?? null;

  return {
    date: dateStr,
    delivery: delivery
      ? {
          forwardCount: delivery.forwardCount,
          reverseCount: delivery.reverseCount,
          note: delivery.note,
          enteredByName: delivery.enteredBy?.name ?? null,
        }
      : null,
    role: role?.role ?? null,
    lastRole: lastRole?.role ?? null,
    vehicles: vehicles.map((v) => ({ ...v, previousMileage: previousBy.get(v.id) ?? null })),
    mileage: dayMileage,
    lastVehicle: { MOTORCYCLE: lastUsed("MOTORCYCLE"), TRUCK: lastUsed("TRUCK") },
    fuel,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const date = String(req.query.date ?? "");
    if (!DATE_RE.test(date)) return res.status(400).json({ error: "請提供日期（YYYY-MM-DD）" });
    res.json(await loadDay(req.user!.id, date));
  })
);

const saveSchema = z.object({
  date: z.string().regex(DATE_RE, "日期格式錯誤"),
  role: z.nativeEnum(DailyRoleType),
  forwardCount: z.number().int("件數必須是整數").min(0, "件數不可小於 0"),
  reverseCount: z.number().int("件數必須是整數").min(0, "件數不可小於 0"),
  note: z.string().trim().max(200).optional().nullable(),
  // 當天騎／開的車與結束里程；沒列出的車會清掉自己這天的里程紀錄（例如取消勾選貨車）
  mileage: z
    .array(z.object({ vehicleId: z.string().min(1), endMileage: z.number().nonnegative("里程不可小於 0") }))
    .max(2)
    .default([]),
  fuel: z
    .object({
      amount: z.number().positive("加油金額必須大於 0"),
      vehicleId: z.string().min(1, "請選擇加油的車輛"),
      note: z.string().trim().max(200).optional().nullable(),
    })
    .optional()
    .nullable(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { date: dateStr, role, forwardCount, reverseCount, note, mileage, fuel } = parsed.data;
    const userId = req.user!.id;
    const date = parseDateOnly(dateStr);

    const vehicleIds = mileage.map((m) => m.vehicleId);
    if (new Set(vehicleIds).size !== vehicleIds.length) {
      return res.status(400).json({ error: "同一台車不能填兩次里程" });
    }
    const needed = Array.from(new Set([...vehicleIds, ...(fuel ? [fuel.vehicleId] : [])]));
    const vehicles = await prisma.vehicle.findMany({ where: { id: { in: needed } } });
    const vehicleBy = new Map(vehicles.map((v) => [v.id, v]));
    if (needed.some((id) => !vehicleBy.has(id))) {
      return res.status(404).json({ error: "找不到指定車輛" });
    }

    // 里程不可小於這台車前一次的紀錄（與「車輛里程」頁同一條規則）
    for (const m of mileage) {
      const existing = await prisma.mileageRecord.findUnique({
        where: { userId_date_vehicleId: { userId, date, vehicleId: m.vehicleId } },
      });
      const previous = await getPreviousMileage(m.vehicleId, date, existing?.id);
      if (previous !== null && m.endMileage < previous) {
        const plate = vehicleBy.get(m.vehicleId)!.plateNumber;
        return res.status(400).json({ error: `${plate} 的結束里程不可小於前一次紀錄（${previous} km）` });
      }
    }

    const [beforeDelivery, beforeRole] = await Promise.all([
      prisma.deliveryRecord.findUnique({ where: { userId_date: { userId, date } } }),
      prisma.dailyRoleRecord.findUnique({ where: { userId_date: { userId, date } } }),
    ]);

    await prisma.$transaction(async (tx) => {
      await tx.dailyRoleRecord.upsert({
        where: { userId_date: { userId, date } },
        update: { role },
        create: { userId, date, role },
      });
      // 本人填寫：清除代填者標記（與「送件」頁相同）
      await tx.deliveryRecord.upsert({
        where: { userId_date: { userId, date } },
        update: { forwardCount, reverseCount, note: note || null, enteredById: null },
        create: { userId, date, forwardCount, reverseCount, note: note || null },
      });

      await tx.mileageRecord.deleteMany({ where: { userId, date, vehicleId: { notIn: vehicleIds } } });
      for (const m of mileage) {
        await tx.mileageRecord.upsert({
          where: { userId_date_vehicleId: { userId, date, vehicleId: m.vehicleId } },
          update: { endMileage: m.endMileage },
          create: { userId, date, vehicleId: m.vehicleId, endMileage: m.endMileage },
        });
        if (m.endMileage > vehicleBy.get(m.vehicleId)!.currentMileage) {
          await tx.vehicle.update({ where: { id: m.vehicleId }, data: { currentMileage: m.endMileage } });
        }
      }

      if (fuel) {
        await tx.fuelReport.create({
          data: { date, amount: fuel.amount, note: fuel.note || null, vehicleId: fuel.vehicleId, employeeId: userId },
        });
      }
    });

    // 操作紀錄：本人改已填過的件數或角色才記（第一次填是日常操作）
    if (beforeDelivery) {
      const changes = [
        ...diff(beforeDelivery, { forwardCount, reverseCount, note: note || null }, DELIVERY_LABELS),
        ...diff(beforeRole, { role }, { role: "今日角色" }, { role: roleText }),
      ];
      if (changes.length) {
        await audit(req, { category: "DELIVERY", action: "UPDATE", summary: `${md(date)} 收工回報（本人修改）`, targetUserId: userId, changes });
      }
    }

    res.json(await loadDay(userId, dateStr));
  })
);

export default router;
