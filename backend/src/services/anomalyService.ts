import { prisma } from "../lib/prisma";
import { startOfNextMonth, taipeiToday, toDateOnlyString } from "../utils/date";

// 資料檢查（異常偵測）：每次查詢時用現有資料即時算，不另外存結果。
// 抓的是「可能打錯」的資料：件數跟本人平常差太多、里程倒退或一天開太多、每公里油錢暴增、同車同天重複報帳。
// 使用者按「沒問題」後記在 AnomalyDismissal；key 含當下的數字，資料改過會重新檢查。

export type AnomalyKind =
  | "delivery-high"
  | "delivery-low"
  | "mileage-back"
  | "mileage-jump"
  | "fuel-rate"
  | "fuel-duplicate"
  | "parking-duplicate"
  | "missing-delivery"
  | "missing-mileage"
  | "driver-no-truck"
  | "leave-with-delivery";

export interface Anomaly {
  key: string;
  kind: AnomalyKind;
  level: "urgent" | "normal";
  date: string; // YYYY-MM-DD（油錢以該月 1 日）
  title: string;
  detail: string;
  to: string; // 去修正的頁面
}

export const WINDOW_DAYS = 45; // 檢查最近幾天的資料
const HISTORY_DAYS = 60; // 「平常」看檢查範圍之前多少天

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function md(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

function km(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ── 件數：跟本人最近的日常比 ─────────────────────────────────────────────────

export interface DeliveryRow {
  id: string;
  userId: string;
  userName: string;
  date: string;
  forwardCount: number;
  reverseCount: number;
}

// rows 含檢查範圍與之前的歷史；只檢查 date ≥ fromDate 的紀錄
export function findDeliveryAnomalies(rows: DeliveryRow[], fromDate: string): Anomaly[] {
  const byUser = new Map<string, DeliveryRow[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  const out: Anomaly[] = [];
  for (const r of rows) {
    if (r.date < fromDate) continue;
    const total = r.forwardCount + r.reverseCount;
    const others = (byUser.get(r.userId) ?? [])
      .filter((o) => o.id !== r.id)
      .map((o) => o.forwardCount + o.reverseCount)
      .filter((t) => t > 0);
    const [y, m] = r.date.split("-").map(Number);
    const base = {
      date: r.date,
      to: `/admin/salary?tab=calc&year=${y}&month=${m}&user=${r.userId}`,
      key: `delivery:${r.id}:${r.forwardCount}:${r.reverseCount}`,
    };
    const counts = `正物流 ${r.forwardCount}、逆物流 ${r.reverseCount}`;
    if (others.length >= 5) {
      const usual = median(others);
      if (total >= usual * 2.5 && total - usual >= 50) {
        out.push({
          ...base,
          kind: "delivery-high",
          level: "urgent",
          title: `${r.userName} ${md(r.date)} 送件填了 ${total} 件`,
          detail: `${counts}；他平常一天約 ${Math.round(usual)} 件，是不是多打了一個數字？這筆會直接影響薪資。`,
        });
      } else if (total > 0 && usual >= 20 && total <= usual / 4) {
        out.push({
          ...base,
          kind: "delivery-low",
          level: "normal",
          title: `${r.userName} ${md(r.date)} 送件只填了 ${total} 件`,
          detail: `${counts}；他平常一天約 ${Math.round(usual)} 件，是不是少打了一個數字？只上半天的話按「沒問題」。`,
        });
      }
    } else if (total > 300) {
      out.push({
        ...base,
        kind: "delivery-high",
        level: "urgent",
        title: `${r.userName} ${md(r.date)} 送件填了 ${total} 件`,
        detail: `${counts}；一天超過 300 件，是不是多打了一個數字？這筆會直接影響薪資。`,
      });
    }
  }
  return out;
}

// ── 里程：倒退、一天開太多 ───────────────────────────────────────────────────

export interface MileageRow {
  id: string;
  vehicleId: string;
  plate: string;
  userName: string;
  date: string;
  endMileage: number;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

// rows 需依車輛、日期、建立時間排序（同 withDistances 的順序）。
// 「開太多」以兩筆之間平均每天幾公里判斷：中間有幾天沒填，累積的里程不會被誤判成一天開的
export function findMileageAnomalies(rows: MileageRow[], fromDate: string): Anomaly[] {
  const byVehicle = new Map<string, MileageRow[]>();
  for (const r of rows) {
    const list = byVehicle.get(r.vehicleId) ?? [];
    list.push(r);
    byVehicle.set(r.vehicleId, list);
  }
  const out: Anomaly[] = [];
  for (const list of byVehicle.values()) {
    const steps = list.slice(1).map((r, i) => {
      const distance = r.endMileage - list[i].endMileage;
      const days = Math.max(1, daysBetween(list[i].date, r.date));
      return { row: r, prev: list[i], distance, days, perDay: distance / days };
    });
    for (const s of steps) {
      if (s.row.date < fromDate) continue;
      const base = { date: s.row.date, to: `/admin?tab=day&date=${s.row.date}` };
      const range = `${km(s.prev.endMileage)} → ${km(s.row.endMileage)} km（${md(s.prev.date)} → ${md(s.row.date)}，${s.row.userName} 填的）`;
      if (s.distance < 0) {
        out.push({
          ...base,
          key: `mileage-back:${s.row.id}:${s.row.endMileage}:${s.prev.endMileage}`,
          kind: "mileage-back",
          level: "urgent",
          title: `${s.row.plate} ${md(s.row.date)} 里程比前一筆少了 ${km(-s.distance)} km`,
          detail: `${range}。里程不會倒退，可能填錯了。`,
        });
        continue;
      }
      const others = steps.filter((o) => o !== s && o.distance > 0).map((o) => o.perDay);
      const usual = others.length >= 5 ? median(others) : null;
      const tooFar = usual !== null ? s.perDay >= usual * 3 && s.perDay - usual >= 150 : s.perDay > 800;
      if (tooFar) {
        out.push({
          ...base,
          key: `mileage-jump:${s.row.id}:${s.row.endMileage}:${s.prev.endMileage}`,
          kind: "mileage-jump",
          level: "urgent",
          title:
            s.days === 1
              ? `${s.row.plate} ${md(s.row.date)} 一天開了 ${km(s.distance)} km`
              : `${s.row.plate} ${md(s.prev.date)}～${md(s.row.date)} ${s.days} 天開了 ${km(s.distance)} km`,
          detail: `${range}。${usual !== null ? `平常一天約 ${km(usual)} km，` : ""}可能多打了一個數字。`,
        });
      }
    }
  }
  return out;
}

// ── 每公里油錢：上個月跟前三個月比 ────────────────────────────────────────────

export interface VehicleMonth {
  ym: string; // YYYY-MM
  fuel: number;
  km: number;
}

export function findFuelRateAnomalies(
  vehicles: { vehicleId: string; plate: string; months: VehicleMonth[] }[],
  targetYm: string
): Anomaly[] {
  const out: Anomaly[] = [];
  for (const v of vehicles) {
    const cur = v.months.find((mo) => mo.ym === targetYm);
    if (!cur || cur.km < 100 || cur.fuel < 500) continue;
    const before = v.months.filter((mo) => mo.ym < targetYm && mo.km >= 100 && mo.fuel > 0);
    if (before.length < 2) continue;
    const rate = cur.fuel / cur.km;
    const usual = before.reduce((s, mo) => s + mo.fuel, 0) / before.reduce((s, mo) => s + mo.km, 0);
    if (rate < usual * 1.5) continue;
    const [y, m] = targetYm.split("-").map(Number);
    out.push({
      key: `fuel-rate:${v.vehicleId}:${targetYm}:${rate.toFixed(2)}`,
      kind: "fuel-rate",
      level: "normal",
      date: `${targetYm}-01`,
      title: `${v.plate} ${m} 月每公里油錢 $${rate.toFixed(1)}`,
      detail: `前 ${before.length} 個月平均 $${usual.toFixed(1)}，高了 ${Math.round((rate / usual - 1) * 100)}%（${y} 年 ${m} 月油資 $${km(cur.fuel)}、開了 ${km(cur.km)} km）。可能要檢查車況，或看看加油紀錄。`,
      to: `/admin/vehicles?vehicle=${v.vehicleId}`,
    });
  }
  return out;
}

// ── 重複報帳：同車同天兩筆加油、同人同天同金額兩筆停車費 ─────────────────────────

export interface ExpenseRow {
  id: string;
  employeeId: string;
  employeeName: string;
  vehicleId: string | null;
  plate: string | null;
  date: string;
  amount: number;
}

export function findDuplicateExpenses(fuel: ExpenseRow[], parking: ExpenseRow[], fromDate: string): Anomaly[] {
  const out: Anomaly[] = [];
  const group = (rows: ExpenseRow[], keyOf: (r: ExpenseRow) => string | null) => {
    const map = new Map<string, ExpenseRow[]>();
    for (const r of rows) {
      if (r.date < fromDate) continue;
      const k = keyOf(r);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.values()].filter((g) => g.length >= 2);
  };
  const listOf = (g: ExpenseRow[]) => g.map((r) => `${r.employeeName} $${km(r.amount)}`).join("、");
  const ids = (g: ExpenseRow[]) => g.map((r) => r.id).sort().join(",");

  for (const g of group(fuel, (r) => (r.vehicleId ? `${r.vehicleId}|${r.date}` : null))) {
    out.push({
      key: `fuel-duplicate:${ids(g)}`,
      kind: "fuel-duplicate",
      level: "normal",
      date: g[0].date,
      title: `${g[0].plate ?? "同一台車"} ${md(g[0].date)} 有 ${g.length} 筆加油`,
      detail: `${listOf(g)}。同一台車同一天加兩次油不常見，核准前確認一下。`,
      to: "/review?tab=fuel",
    });
  }
  for (const g of group(parking, (r) => `${r.employeeId}|${r.date}|${r.amount}`)) {
    out.push({
      key: `parking-duplicate:${ids(g)}`,
      kind: "parking-duplicate",
      level: "normal",
      date: g[0].date,
      title: `${g[0].employeeName} ${md(g[0].date)} 有 ${g.length} 筆一樣金額的停車費`,
      detail: `每筆 $${km(g[0].amount)}。可能重複送出，核准前確認一下。`,
      to: "/review?tab=parking",
    });
  }
  return out;
}

// ── 漏填：有里程沒送件、有送件沒里程、貨車司機沒填貨車里程、請假當天有送件 ─────────────

export interface EntryDelivery {
  id: string;
  userId: string;
  userName: string;
  date: string;
  total: number;
}
export interface EntryMileage {
  userId: string;
  userName: string;
  date: string;
  vehicleType: "MOTORCYCLE" | "TRUCK";
}
export interface EntryRole {
  userId: string;
  date: string;
  role: "NONE" | "TRUCK_DRIVER" | "TRUCK_ATTENDANT";
}
export interface EntryLeave {
  id: string;
  userId: string;
  date: string;
}

// deliveries／mileage 含檢查範圍之前的歷史（用來判斷這個人平常有沒有在填里程）；
// 只檢查 fromDate ≤ 日期 < today（今天可能還在填，不算漏）
export function findMissingEntries(
  input: { deliveries: EntryDelivery[]; mileage: EntryMileage[]; roles: EntryRole[]; leaves: EntryLeave[] },
  fromDate: string,
  today: string
): Anomaly[] {
  const { deliveries, mileage, roles, leaves } = input;
  const k = (userId: string, date: string) => `${userId}|${date}`;
  const deliveryBy = new Map(deliveries.map((d) => [k(d.userId, d.date), d]));
  const mileageBy = new Map<string, EntryMileage[]>();
  for (const m of mileage) mileageBy.set(k(m.userId, m.date), [...(mileageBy.get(k(m.userId, m.date)) ?? []), m]);
  const roleBy = new Map(roles.map((r) => [k(r.userId, r.date), r.role]));
  const leaveBy = new Map(leaves.map((l) => [k(l.userId, l.date), l]));
  const inWindow = (date: string) => date >= fromDate && date < today;
  const out: Anomaly[] = [];

  // 這個人平常送件的日子有幾成有填里程（只看沒當隨車的日子）；平常有填的人才提醒漏填
  const usual = new Map<string, { days: number; withMileage: number }>();
  for (const d of deliveries) {
    if (d.total <= 0 || roleBy.get(k(d.userId, d.date)) === "TRUCK_ATTENDANT") continue;
    const u = usual.get(d.userId) ?? { days: 0, withMileage: 0 };
    u.days++;
    if (mileageBy.has(k(d.userId, d.date))) u.withMileage++;
    usual.set(d.userId, u);
  }
  const usuallyRecords = (userId: string) => {
    const u = usual.get(userId);
    return !!u && u.days >= 10 && u.withMileage / u.days >= 0.8;
  };

  // 有里程沒送件：可能忘了填件數（影響出勤天數與薪資）
  const seen = new Set<string>();
  for (const m of mileage) {
    const key = k(m.userId, m.date);
    if (!inWindow(m.date) || seen.has(key)) continue;
    seen.add(key);
    if (deliveryBy.has(key) || leaveBy.has(key)) continue;
    const [y, mo] = m.date.split("-").map(Number);
    out.push({
      key: `missing-delivery:${m.userId}:${m.date}`,
      kind: "missing-delivery",
      level: "urgent",
      date: m.date,
      title: `${m.userName} ${md(m.date)} 有填里程，沒填送件`,
      detail: "可能忘了填件數，會少算一天出勤與薪資。那天真的沒送件的話按「沒問題」。",
      to: `/admin/salary?tab=calc&year=${y}&month=${mo}&user=${m.userId}`,
    });
  }

  for (const d of deliveries) {
    if (!inWindow(d.date) || d.total <= 0) continue;
    const key = k(d.userId, d.date);
    const role = roleBy.get(key);
    const vehicles = mileageBy.get(key) ?? [];

    // 請假當天有送件
    const leave = leaveBy.get(key);
    if (leave) {
      const [y, mo] = d.date.split("-").map(Number);
      out.push({
        key: `leave-with-delivery:${leave.id}:${d.id}:${d.total}`,
        kind: "leave-with-delivery",
        level: "normal",
        date: d.date,
        title: `${d.userName} ${md(d.date)} 請假，卻有 ${d.total} 件送件`,
        detail: "請假已核准，那天又有送件紀錄。是假單要取消，還是送件填錯日期？",
        to: `/admin/salary?tab=calc&year=${y}&month=${mo}&user=${d.userId}`,
      });
    }

    // 選了貨車司機卻沒填貨車里程
    if (role === "TRUCK_DRIVER" && !vehicles.some((v) => v.vehicleType === "TRUCK")) {
      out.push({
        key: `driver-no-truck:${d.userId}:${d.date}`,
        kind: "driver-no-truck",
        level: "normal",
        date: d.date,
        title: `${d.userName} ${md(d.date)} 是貨車司機，沒填貨車里程`,
        detail: "可能忘了填貨車里程，或今日角色選錯了（司機加給依今日角色計算）。",
        to: `/admin?tab=day&date=${d.date}`,
      });
      continue;
    }

    // 有送件沒里程（平常都有填里程的人才提醒；隨車人員不用填）
    if (vehicles.length === 0 && role !== "TRUCK_ATTENDANT" && usuallyRecords(d.userId)) {
      out.push({
        key: `missing-mileage:${d.userId}:${d.date}`,
        kind: "missing-mileage",
        level: "normal",
        date: d.date,
        title: `${d.userName} ${md(d.date)} 有送件，沒填里程`,
        detail: "他平常都有填車輛里程，這天可能忘了；里程會影響每公里油錢與保養提醒。",
        to: `/admin?tab=day&date=${d.date}`,
      });
    }
  }
  return out;
}

// ── 從資料庫撈資料、合併、標上是否已確認 ─────────────────────────────────────────

export interface AnomalyWithState extends Anomaly {
  dismissed: boolean;
}

function ymOf(date: Date): string {
  return toDateOnlyString(date).slice(0, 7);
}

export async function detectAnomalies(now = new Date()): Promise<{ from: string; to: string; items: AnomalyWithState[] }> {
  const today = taipeiToday(now);
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const fromStr = toDateOnlyString(from);
  const historyFrom = addDays(from, -HISTORY_DAYS);

  // 油錢比對：上個月（已結束）對前三個月；里程多抓一個月以算出第一筆的行駛距離
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const target = new Date(Date.UTC(y, m - 2, 1));
  const targetYm = ymOf(target);
  const rateFrom = new Date(Date.UTC(y, m - 5, 1));
  const rateMileageFrom = new Date(Date.UTC(y, m - 6, 1));
  const targetEnd = startOfNextMonth(target.getUTCFullYear(), target.getUTCMonth() + 1);

  const [deliveries, windowMileage, fuel, parking, rateFuel, rateMileage, dismissals, userMileage, roles, leaves] = await Promise.all([
    prisma.deliveryRecord.findMany({
      where: { date: { gte: historyFrom } },
      select: { id: true, userId: true, date: true, forwardCount: true, reverseCount: true, user: { select: { name: true } } },
    }),
    prisma.mileageRecord.findMany({ where: { date: { gte: from } }, select: { vehicleId: true }, distinct: ["vehicleId"] }),
    prisma.fuelReport.findMany({
      where: { date: { gte: from }, status: { not: "REJECTED" } },
      select: { id: true, employeeId: true, vehicleId: true, date: true, amount: true, employee: { select: { name: true } }, vehicle: { select: { plateNumber: true } } },
    }),
    prisma.parkingFeeReport.findMany({
      where: { date: { gte: from }, status: { not: "REJECTED" } },
      select: { id: true, employeeId: true, vehicleId: true, date: true, amount: true, employee: { select: { name: true } }, vehicle: { select: { plateNumber: true } } },
    }),
    prisma.fuelReport.findMany({
      where: { date: { gte: rateFrom, lt: targetEnd }, status: { not: "REJECTED" }, vehicleId: { not: null } },
      select: { vehicleId: true, date: true, amount: true },
    }),
    prisma.mileageRecord.findMany({
      where: { date: { gte: rateMileageFrom, lt: targetEnd } },
      select: { vehicleId: true, date: true, endMileage: true, vehicle: { select: { plateNumber: true } } },
      orderBy: [{ vehicleId: "asc" }, { date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.anomalyDismissal.findMany({ select: { key: true } }),
    // 漏填檢查：每個人每天騎／開了哪種車（含歷史，用來判斷平常有沒有在填）、今日角色、已核准的請假
    prisma.mileageRecord.findMany({
      where: { date: { gte: historyFrom } },
      select: { userId: true, date: true, vehicle: { select: { type: true } }, user: { select: { name: true } } },
    }),
    prisma.dailyRoleRecord.findMany({ where: { date: { gte: historyFrom } }, select: { userId: true, date: true, role: true } }),
    prisma.leaveRequest.findMany({ where: { date: { gte: from }, status: "APPROVED" }, select: { id: true, userId: true, date: true } }),
  ]);

  const mileageVehicleIds = windowMileage.map((r) => r.vehicleId);
  const mileage = mileageVehicleIds.length
    ? await prisma.mileageRecord.findMany({
        where: { vehicleId: { in: mileageVehicleIds }, date: { gte: addDays(from, -120) } },
        select: { id: true, vehicleId: true, date: true, endMileage: true, vehicle: { select: { plateNumber: true } }, user: { select: { name: true } } },
        orderBy: [{ vehicleId: "asc" }, { date: "asc" }, { createdAt: "asc" }],
      })
    : [];

  const expenseRows = (rows: typeof fuel): ExpenseRow[] =>
    rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      vehicleId: r.vehicleId,
      plate: r.vehicle?.plateNumber ?? null,
      date: toDateOnlyString(r.date),
      amount: r.amount,
    }));

  // 每台車每月：油資（依加油日期）、行駛距離（依里程紀錄日期，算與前一筆的差）
  const monthly = new Map<string, { plate: string; months: Map<string, VehicleMonth> }>();
  const monthOf = (vehicleId: string, plate: string, ym: string) => {
    const v = monthly.get(vehicleId) ?? { plate, months: new Map() };
    monthly.set(vehicleId, v);
    const mo = v.months.get(ym) ?? { ym, fuel: 0, km: 0 };
    v.months.set(ym, mo);
    return mo;
  };
  const prevByVehicle = new Map<string, number>();
  for (const r of rateMileage) {
    const prev = prevByVehicle.get(r.vehicleId);
    prevByVehicle.set(r.vehicleId, r.endMileage);
    if (prev === undefined || r.date < rateFrom) continue;
    const d = r.endMileage - prev;
    if (d > 0) monthOf(r.vehicleId, r.vehicle.plateNumber, ymOf(r.date)).km += d;
  }
  const plates = new Map(rateMileage.map((r) => [r.vehicleId, r.vehicle.plateNumber]));
  for (const f of rateFuel) {
    const plate = plates.get(f.vehicleId!);
    if (!plate) continue; // 沒有里程紀錄的車無法算每公里油錢
    monthOf(f.vehicleId!, plate, ymOf(f.date)).fuel += f.amount;
  }

  const anomalies = [
    ...findDeliveryAnomalies(
      deliveries.map((d) => ({
        id: d.id,
        userId: d.userId,
        userName: d.user.name,
        date: toDateOnlyString(d.date),
        forwardCount: d.forwardCount,
        reverseCount: d.reverseCount,
      })),
      fromStr
    ),
    ...findMileageAnomalies(
      mileage.map((r) => ({
        id: r.id,
        vehicleId: r.vehicleId,
        plate: r.vehicle.plateNumber,
        userName: r.user.name,
        date: toDateOnlyString(r.date),
        endMileage: r.endMileage,
      })),
      fromStr
    ),
    ...findFuelRateAnomalies(
      [...monthly.entries()].map(([vehicleId, v]) => ({ vehicleId, plate: v.plate, months: [...v.months.values()] })),
      targetYm
    ),
    ...findDuplicateExpenses(expenseRows(fuel), expenseRows(parking), fromStr),
    ...findMissingEntries(
      {
        deliveries: deliveries.map((d) => ({
          id: d.id,
          userId: d.userId,
          userName: d.user.name,
          date: toDateOnlyString(d.date),
          total: d.forwardCount + d.reverseCount,
        })),
        mileage: userMileage.map((m) => ({
          userId: m.userId,
          userName: m.user.name,
          date: toDateOnlyString(m.date),
          vehicleType: m.vehicle.type,
        })),
        roles: roles.map((r) => ({ userId: r.userId, date: toDateOnlyString(r.date), role: r.role })),
        leaves: leaves.map((l) => ({ id: l.id, userId: l.userId, date: toDateOnlyString(l.date) })),
      },
      fromStr,
      toDateOnlyString(today)
    ),
  ];

  const dismissed = new Set(dismissals.map((d) => d.key));
  const order = { urgent: 0, normal: 1 } as const;
  const items = anomalies
    .map((a) => ({ ...a, dismissed: dismissed.has(a.key) }))
    .sort((a, b) => order[a.level] - order[b.level] || b.date.localeCompare(a.date));

  return { from: fromStr, to: toDateOnlyString(today), items };
}

// 只取月份範圍內的異常（月底結算、週報用）
export function inRange(items: AnomalyWithState[], fromDate: string, toDate: string) {
  return items.filter((a) => a.date >= fromDate && a.date <= toDate);
}
