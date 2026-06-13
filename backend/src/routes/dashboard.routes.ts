import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrManager } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { startOfMonth, startOfNextMonth, parseDateOnly, toDateOnlyString } from "../utils/date";
import { listVehicleStatuses } from "../services/vehicleService";
import { calculateAllEmployeesMonthlySalary } from "../services/salaryService";
import { withAfterTaxPricing, toAfterTaxPrice } from "../services/pricingService";

const router = Router();
router.use(requireAuth, requireAdminOrManager);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const todayStr = toDateOnlyString(now);
    const today = parseDateOnly(todayStr);
    const monthStart = startOfMonth(year, month);
    const monthEnd = startOfNextMonth(year, month);

    // 今日全員送件總件數
    const todayRecords = await prisma.deliveryRecord.findMany({
      where: { date: today },
    });
    const todayTotals = todayRecords.reduce(
      (acc, r) => {
        acc.forwardTotal += r.forwardCount;
        acc.reverseTotal += r.reverseCount;
        return acc;
      },
      { forwardTotal: 0, reverseTotal: 0 }
    );

    // 本月累計件數
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
    let estimatedRevenue: number | null = null;
    if (pricing) {
      const withTax = withAfterTaxPricing(pricing);
      estimatedRevenue =
        monthTotals.forwardTotal * withTax.forwardPriceAfterTax +
        monthTotals.reverseTotal * withTax.reversePriceAfterTax;
    }
    const estimatedProfit = estimatedRevenue !== null ? estimatedRevenue - estimatedSalaryTotal : null;

    // 車輛今日使用狀況 + 保養提醒
    const vehicleStatuses = await listVehicleStatuses();
    const todayMileage = await prisma.mileageRecord.findMany({
      where: { date: today },
      include: { vehicle: true, user: { select: { id: true, name: true } } },
    });

    // 待處理事項
    const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
    const prevYear = prevMonthDate.getUTCFullYear();
    const prevMonth = prevMonthDate.getUTCMonth() + 1;
    const prevReconciliation = await prisma.reconciliationRecord.findUnique({
      where: { year_month: { year: prevYear, month: prevMonth } },
    });

    const alerts = {
      pricingNotSet: !pricing,
      unreconciledPreviousMonth: !prevReconciliation
        ? { year: prevYear, month: prevMonth }
        : null,
      vehiclesNeedingMaintenance: vehicleStatuses.filter((v) => v.needsMaintenance || v.maintenanceWarning),
    };

    res.json({
      year,
      month,
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
      vehicles: vehicleStatuses,
      todayMileage: todayMileage.map((m) => ({
        ...m,
        distance: m.endMileage - m.startMileage,
      })),
      alerts,
    });
  })
);

export default router;
