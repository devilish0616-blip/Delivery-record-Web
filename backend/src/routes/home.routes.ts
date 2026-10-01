import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOnly, startOfMonth, startOfNextMonth, toDateOnlyString } from "../utils/date";
import { listVehicleStatuses } from "../services/vehicleService";
import { getSalaryMonthLock } from "../services/salaryService";

const router = Router();
router.use(requireAuth);

// 首頁「我的待辦」：依使用者身分彙整成一份清單，取代過去首頁與儀表板各一份的提醒。
// level：urgent＝已逾期或需要立刻處理、normal＝待處理、info＝僅提示；to＝點擊後前往的頁面
export interface TodoItem {
  key: string;
  level: "urgent" | "normal" | "info";
  title: string;
  detail?: string;
  to: string;
}

router.get(
  "/todos",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const isAdmin = user.role === "ADMIN";
    const isManager = isAdmin || user.role === "MANAGER";
    const canVehicles = isManager || user.capabilities.includes("MANAGE_VEHICLES");

    const now = new Date();
    const today = parseDateOnly(toDateOnlyString(now));
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const todos: TodoItem[] = [];

    // ── 自己的事 ──
    const [myDelivery, myPending] = await Promise.all([
      prisma.deliveryRecord.findUnique({ where: { userId_date: { userId: user.id, date: today } } }),
      Promise.all([
        prisma.fuelReport.count({ where: { employeeId: user.id, status: "PENDING" } }),
        prisma.parkingFeeReport.count({ where: { employeeId: user.id, status: "PENDING" } }),
        prisma.leaveRequest.count({ where: { userId: user.id, status: "PENDING" } }),
        prisma.repairRequest.count({ where: { reportedById: user.id, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
      ]),
    ]);
    if (!myDelivery) {
      todos.push({ key: "my-delivery", level: "normal", title: "今天還沒填送件記錄", to: "/delivery" });
    }
    const myPendingTotal = myPending.reduce((a, b) => a + b, 0);
    if (myPendingTotal > 0) {
      todos.push({
        key: "my-requests",
        level: "info",
        title: `你有 ${myPendingTotal} 筆申請等待主管處理`,
        to: "/requests",
      });
    }

    // ── 主管：審核、送件回報、單價、薪資封存、記帳 ──
    if (isManager) {
      const [fuel, parking, leave, activeUsers, todayRecords, pricing, settings, pendingFinance] = await Promise.all([
        prisma.fuelReport.count({ where: { status: "PENDING" } }),
        prisma.parkingFeeReport.count({ where: { status: "PENDING" } }),
        prisma.leaveRequest.count({ where: { status: "PENDING" } }),
        prisma.user.count({ where: { isActive: true } }),
        prisma.deliveryRecord.count({ where: { date: today } }),
        prisma.monthlyPricing.findUnique({ where: { year_month: { year, month } } }),
        prisma.salarySettings.findUnique({ where: { id: 1 } }),
        isAdmin ? prisma.financeRecord.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
      ]);

      const reviewParts = [
        fuel > 0 && `油資 ${fuel}`,
        parking > 0 && `停車費 ${parking}`,
        leave > 0 && `請假 ${leave}`,
      ].filter(Boolean);
      if (reviewParts.length > 0) {
        todos.push({
          key: "review",
          level: "normal",
          title: `${fuel + parking + leave} 筆申請待審核`,
          detail: reviewParts.join("・"),
          to: "/review",
        });
      }

      const missing = activeUsers - todayRecords;
      if (missing > 0) {
        todos.push({
          key: "missing-delivery",
          level: "info",
          title: `今天還有 ${missing} 位員工沒填送件`,
          to: "/admin?tab=day",
        });
      }

      if (!pricing) {
        todos.push({
          key: "pricing",
          level: "urgent",
          title: `尚未設定本月（${month} 月）收入單價`,
          detail: "營運總覽與帳務月報的預估營收會顯示為未設定",
          to: "/admin/settings",
        });
      }

      // 薪資封存提醒：過了寬限日（次月第 N 日）後，若上月仍未封存且上月確有送件紀錄則提醒
      const graceDay = settings?.salaryLockGraceDay ?? 5;
      if (now.getUTCDate() >= graceDay) {
        const prev = new Date(Date.UTC(year, month - 2, 1));
        const prevYear = prev.getUTCFullYear();
        const prevMonth = prev.getUTCMonth() + 1;
        const [prevLock, prevDeliveryCount] = await Promise.all([
          getSalaryMonthLock(prevYear, prevMonth),
          prisma.deliveryRecord.count({
            where: { date: { gte: startOfMonth(prevYear, prevMonth), lt: startOfNextMonth(prevYear, prevMonth) } },
          }),
        ]);
        if (!prevLock && prevDeliveryCount > 0) {
          todos.push({
            key: "salary-lock",
            level: "urgent",
            title: `${prevYear} 年 ${prevMonth} 月薪資尚未封存`,
            detail: "確認資料無誤後請封存，避免日後補登改到已發的薪資",
            to: `/admin/salary`,
          });
        }
      }

      if (pendingFinance > 0) {
        todos.push({
          key: "finance",
          level: "normal",
          title: `${pendingFinance} 筆記帳待核准`,
          to: "/admin/finance?status=PENDING",
        });
      }
    }

    // ── 車輛：報修、保養、證件 ──
    if (canVehicles) {
      const statuses = await listVehicleStatuses();
      const openRepairs = statuses.reduce((sum, v) => sum + v.openRepairCount, 0);
      if (openRepairs > 0) {
        todos.push({
          key: "repairs",
          level: "normal",
          title: `${openRepairs} 筆車輛報修待處理`,
          detail: statuses
            .filter((v) => v.openRepairCount > 0)
            .map((v) => v.plateNumber)
            .join("、"),
          to: "/review?tab=repair",
        });
      }
      for (const v of statuses.filter((s) => s.isActive)) {
        for (const m of v.maintenanceItems.filter((i) => i.needsChange || i.warning)) {
          todos.push({
            key: `maint-${v.id}-${m.id}`,
            level: m.needsChange ? "urgent" : "normal",
            title: `${v.plateNumber}：${m.itemName}${m.needsChange ? "已逾期" : "快到保養"}`,
            detail: m.needsChange
              ? undefined
              : `剩 ${Math.round(m.remaining)} km${m.remainingDays !== null ? ` / ${m.remainingDays} 天` : ""}`,
            to: "/admin/vehicles",
          });
        }
        for (const d of v.documents.filter((doc) => doc.expired || doc.expiring)) {
          todos.push({
            key: `doc-${v.id}-${d.key}`,
            level: d.expired ? "urgent" : "normal",
            title: `${v.plateNumber}：${d.label}${d.expired ? "已逾期" : `${d.daysUntil} 天後到期`}`,
            detail: d.date ? `到期日 ${toDateOnlyString(new Date(d.date))}` : undefined,
            to: "/admin/vehicles",
          });
        }
      }
    }

    const order = { urgent: 0, normal: 1, info: 2 } as const;
    todos.sort((a, b) => order[a.level] - order[b.level]);
    res.json({ todos });
  })
);

export default router;
