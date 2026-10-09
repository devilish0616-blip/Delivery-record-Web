import { describe, expect, it } from "vitest";
import { taipeiDateString, taipeiDateTimeString, taipeiParts, taipeiToday } from "./date";

describe("台灣時間", () => {
  it("台灣早上 7 點（UTC 前一天 23 點）仍算台灣當天", () => {
    const now = new Date("2026-10-08T23:00:00Z"); // 台灣 10/9 07:00
    expect(taipeiDateString(now)).toBe("2026-10-09");
    expect(taipeiToday(now).toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("每月 1 日清晨不會被算成上個月", () => {
    const now = new Date("2026-10-31T17:30:00Z"); // 台灣 11/1 01:30
    expect(taipeiParts(now)).toEqual({ year: 2026, month: 11, day: 1 });
  });

  it("台灣晚上 11 點仍是當天", () => {
    const now = new Date("2026-10-09T15:00:00Z"); // 台灣 10/9 23:00
    expect(taipeiDateString(now)).toBe("2026-10-09");
    expect(taipeiDateTimeString(now)).toBe("2026-10-09 23:00");
  });
});
