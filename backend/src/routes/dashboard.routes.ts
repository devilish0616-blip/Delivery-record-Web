import { Router } from "express";
import ExcelJS from "exceljs";
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

// 匯出當月全員送件狀況 (Excel)：
//   分頁 1「送件明細」 — 日期 / 姓名 / 正物流 / 逆物流（僅列有送件記錄者，依日期→姓名排序）
//   分頁 2「司機跟車」 — 日期 / 司機 / 跟車（列出整月每一天，沒人開貨車則留空白）
router.get(
  "/delivery-export",
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!year || !month || month < 1 || month > 12) {
      throw Object.assign(new Error("請提供有效的 year 與 month"), { status: 400 });
    }
    const monthStart = startOfMonth(year, month);
    const monthEnd = startOfNextMonth(year, month);

    const [deliveryRecords, roleRecords] = await Promise.all([
      prisma.deliveryRecord.findMany({
        where: { date: { gte: monthStart, lt: monthEnd } },
        include: { user: { select: { name: true } } },
        orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
      }),
      prisma.dailyRoleRecord.findMany({
        where: { date: { gte: monthStart, lt: monthEnd }, role: { not: "NONE" } },
        include: { user: { select: { name: true } } },
        orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
      }),
    ]);

    const workbook = new ExcelJS.Workbook();

    // 分頁 1：送件明細
    const deliverySheet = workbook.addWorksheet("送件明細");
    deliverySheet.columns = [
      { header: "日期", key: "date", width: 12 },
      { header: "姓名", key: "name", width: 16 },
      { header: "正物流", key: "forwardCount", width: 10 },
      { header: "逆物流", key: "reverseCount", width: 10 },
    ];
    for (const r of deliveryRecords) {
      deliverySheet.addRow({
        date: toDateOnlyString(r.date),
        name: r.user.name,
        forwardCount: r.forwardCount,
        reverseCount: r.reverseCount,
      });
    }

    // 分頁 2：司機跟車（依日期彙整當天的司機與跟車人員）
    const driversByDate = new Map<string, string[]>();
    const attendantsByDate = new Map<string, string[]>();
    for (const r of roleRecords) {
      const dateStr = toDateOnlyString(r.date);
      const target = r.role === "TRUCK_DRIVER" ? driversByDate : attendantsByDate;
      const names = target.get(dateStr) ?? [];
      names.push(r.user.name);
      target.set(dateStr, names);
    }

    const roleSheet = workbook.addWorksheet("司機跟車");
    roleSheet.columns = [
      { header: "日期", key: "date", width: 12 },
      { header: "司機", key: "drivers", width: 30 },
      { header: "跟車", key: "attendants", width: 30 },
    ];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      roleSheet.addRow({
        date: dateStr,
        drivers: (driversByDate.get(dateStr) ?? []).join("、"),
        attendants: (attendantsByDate.get(dateStr) ?? []).join("、"),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="delivery-status-${year}-${String(month).padStart(2, "0")}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  })
);

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
