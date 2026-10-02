import { describe, expect, it } from "vitest";
import {
  findDeliveryAnomalies,
  findDuplicateExpenses,
  findFuelRateAnomalies,
  findMileageAnomalies,
  type DeliveryRow,
  type ExpenseRow,
  type MileageRow,
} from "./anomalyService";

function deliveries(totals: number[], startDay = 1): DeliveryRow[] {
  return totals.map((t, i) => ({
    id: `d${i}`,
    userId: "u1",
    userName: "王小華",
    date: `2026-09-${String(startDay + i).padStart(2, "0")}`,
    forwardCount: t,
    reverseCount: 0,
  }));
}

describe("findDeliveryAnomalies", () => {
  it("比平常多很多（多打一個 0）列為緊急", () => {
    const rows = deliveries([55, 52, 58, 60, 54, 57, 580]);
    const found = findDeliveryAnomalies(rows, "2026-09-01");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "delivery-high", level: "urgent", key: "delivery:d6:580:0", date: "2026-09-07" });
    expect(found[0].title).toBe("王小華 9/7 送件填了 580 件");
  });

  it("比平常少很多（少打一個數字）列為提醒", () => {
    const found = findDeliveryAnomalies(deliveries([55, 52, 58, 60, 54, 5]), "2026-09-01");
    expect(found.map((a) => a.kind)).toEqual(["delivery-low"]);
  });

  it("一般的高低起伏不算異常", () => {
    expect(findDeliveryAnomalies(deliveries([55, 70, 48, 62, 40, 90, 35]), "2026-09-01")).toEqual([]);
  });

  it("歷史不夠時只抓一天超過 300 件", () => {
    expect(findDeliveryAnomalies(deliveries([50, 350]), "2026-09-01").map((a) => a.kind)).toEqual(["delivery-high"]);
    expect(findDeliveryAnomalies(deliveries([50, 250]), "2026-09-01")).toEqual([]);
  });

  it("檢查範圍之前的紀錄只當作平常的參考，不列出", () => {
    const rows = deliveries([580, 55, 52, 58, 60, 54, 57]);
    expect(findDeliveryAnomalies(rows, "2026-09-02")).toEqual([]);
  });
});

function mileage(ends: number[]): MileageRow[] {
  return ends.map((e, i) => ({
    id: `m${i}`,
    vehicleId: "v1",
    plate: "MXK-552",
    userName: "陳志明",
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    endMileage: e,
  }));
}

describe("findMileageAnomalies", () => {
  it("里程倒退", () => {
    const found = findMileageAnomalies(mileage([1000, 1080, 1160, 1040]), "2026-09-01");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "mileage-back", level: "urgent", date: "2026-09-04" });
    expect(found[0].title).toBe("MXK-552 9/4 里程比前一筆少了 120 km");
  });

  it("一天開太多（多打一個數字）", () => {
    const found = findMileageAnomalies(mileage([1000, 1080, 1170, 1255, 1345, 1440, 1520, 15200]), "2026-09-01");
    expect(found.map((a) => a.kind)).toEqual(["mileage-jump"]);
  });

  it("中間幾天沒填、累積的里程換算成每天不算多，不列出", () => {
    const rows = mileage([1000, 1080, 1170, 1255, 1345, 1440]);
    rows.push({ ...rows[0], id: "m-late", date: "2026-09-16", endMileage: 2240 }); // 10 天開 800 km
    expect(findMileageAnomalies(rows, "2026-09-01")).toEqual([]);
  });

  it("正常的里程不列出", () => {
    expect(findMileageAnomalies(mileage([1000, 1080, 1170, 1255, 1345, 1440, 1600]), "2026-09-01")).toEqual([]);
  });
});

describe("findFuelRateAnomalies", () => {
  const months = (target: { fuel: number; km: number }) => [
    { ym: "2026-06", fuel: 1800, km: 1000 },
    { ym: "2026-07", fuel: 1900, km: 1050 },
    { ym: "2026-08", fuel: 1700, km: 950 },
    { ym: "2026-09", ...target },
  ];

  it("每公里油錢比前三個月高五成以上", () => {
    const found = findFuelRateAnomalies([{ vehicleId: "v1", plate: "MXK-552", months: months({ fuel: 2900, km: 1000 }) }], "2026-09");
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe("MXK-552 9 月每公里油錢 $2.9");
    expect(found[0].detail).toContain("前 3 個月平均 $1.8");
  });

  it("差不多時不列出；前面月份資料不夠也不列出", () => {
    expect(findFuelRateAnomalies([{ vehicleId: "v1", plate: "A", months: months({ fuel: 2000, km: 1000 }) }], "2026-09")).toEqual([]);
    expect(
      findFuelRateAnomalies([{ vehicleId: "v1", plate: "A", months: [{ ym: "2026-08", fuel: 1700, km: 950 }, { ym: "2026-09", fuel: 2900, km: 1000 }] }], "2026-09")
    ).toEqual([]);
  });
});

describe("findDuplicateExpenses", () => {
  const row = (id: string, over: Partial<ExpenseRow>): ExpenseRow => ({
    id,
    employeeId: "u1",
    employeeName: "陳志明",
    vehicleId: "v1",
    plate: "MXK-552",
    date: "2026-10-01",
    amount: 380,
    ...over,
  });

  it("同一台車同一天兩筆加油", () => {
    const found = findDuplicateExpenses([row("f1", {}), row("f2", { employeeId: "u2", employeeName: "王小華" })], [], "2026-09-01");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "fuel-duplicate", key: "fuel-duplicate:f1,f2" });
  });

  it("同一人同一天同金額兩筆停車費；金額不同不算", () => {
    expect(findDuplicateExpenses([], [row("p1", { amount: 60 }), row("p2", { amount: 60 })], "2026-09-01")).toHaveLength(1);
    expect(findDuplicateExpenses([], [row("p1", { amount: 60 }), row("p2", { amount: 40 })], "2026-09-01")).toEqual([]);
  });
});
