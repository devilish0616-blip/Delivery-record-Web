import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { startOfMonth, startOfNextMonth, parseDateOnly, toDateOnlyString } from "../utils/date";
import { listVehicleStatuses } from "../services/vehicleService";
import { withDistances } from "../services/mileageService";
import { calculateAllEmployeesMonthlySalary } from "../services/salaryService";
import { withAfterTaxPricing, toAfterTaxPrice } from "../services/pricingService";

const router = Router();
router.use(requireAuth, requireAdminOrManager);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    const year = Number(req.query.year) || currentYear;
    const month = Number(req.query.month) || currentMonth;
    if (month < 1 || month > 12) {
      throw Object.assign(new Error("月份須為 1-12"), { status: 400 });
    }
    const isCurrentMonth = year === currentYear && month === currentMonth;

    const todayStr = toDateOnlyString(now);
    const today = parseDateOnly(todayStr);
    const monthStart = startOfMonth(year, month);
    const monthEnd = startOfNextMonth(year, month);

    // 今日全員送件總件數（僅當查看當月時提供）
    let todayTotals: { forwardTotal: number; reverseTotal: number } | null = null;
    if (isCurrentMonth) {
      const todayRecords = await prisma.deliveryRecord.findMany({
        where: { date: today },
      });
      todayTotals = todayRecords.reduce(
        (acc, r) => {
          acc.forwardTotal += r.forwardCount;
          acc.reverseTotal += r.reverseCount;
          return acc;
        },
        { forwardTotal: 0, reverseTotal: 0 }
      );
    }

    // 該月累計件數
    const monthRecords = await prisma.deliveryRecord.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
    });
    const monthTotals = monthRecords.reduce(
      (acc, r) => {
        acc.forwardTotal += r.forwardCount;
        acc.reverseTotal += r.reverseCount;
        return acc;
      },
      { forwardTotal: 0, reverseTotal: 0 }
    );
    const monthTotalCount = monthTotals.forwardTotal + monthTotals.reverseTotal;

    // 本月預估薪資總支出
    const salaries = await calculateAllEmployeesMonthlySalary(year, month);
    const estimatedSalaryTotal = salaries.reduce((sum, s) => sum + s.totalSalary, 0);

    // 本月預估總收入（需已設定本月單價）
    const pricing = await prisma.monthlyPricing.findUnique({
      where: { year_month: { year, month } },
    });
    const withTax = pricing ? withAfterTaxPricing(pricing) : null;
    let estimatedRevenue: number | null = null;
    if (withTax) {
      estimatedRevenue =
        monthTotals.forwardTotal * withTax.forwardPriceAfterTax +
        monthTotals.reverseTotal * withTax.reversePriceAfterTax;
    }
    const estimatedProfit = estimatedRevenue !== null ? estimatedRevenue - estimatedSalaryTotal : null;

    // 每日營運總表：依全員薪資明細彙整每天的件數、薪資成本、營收、毛利、司機/跟車
    const dayMap = new Map<
      string,
      {
        forwardCount: number;
        reverseCount: number;
        salaryCost: number;
        attendance: number;
        drivers: string[];
        attendants: string[];
      }
    >();
    for (const emp of salaries) {
      for (const d of emp.dailyDetails) {
        const entry = dayMap.get(d.date) ?? {
          forwardCount: 0,
          reverseCount: 0,
          salaryCost: 0,
          attendance: 0,
          drivers: [] as string[],
          attendants: [] as string[],
        };
        entry.forwardCount += d.forwardCount;
        entry.reverseCount += d.reverseCount;
        entry.attendance += 1;
        let cost = d.subtotal;
        if (d.role === "TRUCK_DRIVER") {
          cost += emp.driverBonus;
          entry.drivers.push(emp.userName);
        } else if (d.role === "TRUCK_ATTENDANT") {
          cost += emp.attendantBonus;
          entry.attendants.push(emp.userName);
        }
        entry.salaryCost += cost;
        dayMap.set(d.date, entry);
      }
    }

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dailyBreakdown = Array.from({ length: daysInMonth }, (_, i) => {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      const entry = dayMap.get(date);
      const forwardCount = entry?.forwardCount ?? 0;
      const reverseCount = entry?.reverseCount ?? 0;
      const totalCount = forwardCount + reverseCount;
      const salaryCost = entry?.salaryCost ?? 0;
      const revenue = withTax
        ? forwardCount * withTax.forwardPriceAfterTax + reverseCount * withTax.reversePriceAfterTax
        : null;
      const profit = revenue !== null ? revenue - salaryCost : null;
      const profitPerItem = profit !== null && totalCount > 0 ? profit / totalCount : null;
      return {
        date,
        forwardCount,
        reverseCount,
        totalCount,
        salaryCost,
        revenue,
        profit,
        profitPerItem,
        attendanceCount: entry?.attendance ?? 0,
        drivers: entry?.drivers ?? [],
        attendants: entry?.attendants ?? [],
      };
    });

    // 每日送件狀況：指定日期（預設今天）所有在職員工的送件記錄與今日角色
    const dateParam = typeof req.query.date === "string" ? req.query.date : todayStr;
    let dailyStatusDate: Date;
    try {
      dailyStatusDate = parseDateOnly(dateParam);
    } catch {
      throw Object.assign(new Error("日期格式錯誤"), { status: 400 });
    }

    const [activeUsers, deliveryRecordsForDate, dailyRolesForDate] = await Promise.all([
      prisma.user.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
      prisma.deliveryRecord.findMany({ where: { date: dailyStatusDate } }),
      prisma.dailyRoleRecord.findMany({ where: { date: dailyStatusDate } }),
    ]);
    const deliveryByUser = new Map(deliveryRecordsForDate.map((r) => [r.userId, r]));
    const roleByUser = new Map(dailyRolesForDate.map((r) => [r.userId, r.role]));

    const dailyStatus = {
      date: toDateOnlyString(dailyStatusDate),
      employees: activeUsers.map((u) => {
        const record = deliveryByUser.get(u.id);
        return {
          userId: u.id,
          name: u.name,
          role: u.role,
          hasRecord: Boolean(record),
          forwardCount: record?.forwardCount ?? 0,
          reverseCount: record?.reverseCount ?? 0,
          note: record?.note ?? null,
          dailyRole: roleByUser.get(u.id) ?? null,
        };
      }),
    };

    // 車輛今日使用狀況 + 保養提醒、待處理事項（僅當查看當月時提供）
    let vehicleStatuses: Awaited<ReturnType<typeof listVehicleStatuses>> | null = null;
    let todayMileage: Awaited<ReturnType<typeof prisma.mileageRecord.findMany>> | null = null;
    let alerts: {
      pricingNotSet: boolean;
      unreconciledPreviousMonth: { year: number; month: number } | null;
      vehiclesNeedingMaintenance: Awaited<ReturnType<typeof listVehicleStatuses>>;
    } | null = null;

    if (isCurrentMonth) {
      vehicleStatuses = await listVehicleStatuses();
      todayMileage = await prisma.mileageRecord.findMany({
        where: { date: today },
        include: { vehicle: true, user: { select: { id: true, name: true } } },
      });

      const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
      const prevYear = prevMonthDate.getUTCFullYear();
      const prevMonth = prevMonthDate.getUTCMonth() + 1;
      const prevReconciliation = await prisma.reconciliationRecord.findUnique({
        where: { year_month: { year: prevYear, month: prevMonth } },
      });

      alerts = {
        pricingNotSet: !pricing,
        unreconciledPreviousMonth: !prevReconciliation
          ? { year: prevYear, month: prevMonth }
          : null,
        vehiclesNeedingMaintenance: vehicleStatuses.filter((v) => v.needsMaintenance || v.maintenanceWarning),
      };
    }

    res.json({
      year,
      month,
      isCurrentMonth,
      today: todayTotals,
      month_summary: {
        forwardTotal: monthTotals.forwardTotal,
        reverseTotal: monthTotals.reverseTotal,
        totalCount: monthTotalCount,
        estimatedSalaryTotal,
        estimatedRevenue,
        estimatedProfit,
        forwardPriceAfterTax: pricing ? toAfterTaxPrice(pricing.forwardPriceBeforeTax) : null,
        reversePriceAfterTax: pricing ? toAfterTaxPrice(pricing.reversePriceBeforeTax) : null,
      },
      dailyStatus,
      dailyBreakdown,
      vehicles: vehicleStatuses,
      todayMileage: todayMileage ? await withDistances(todayMileage) : null,
      alerts,
    });
  })
);

export default router;
