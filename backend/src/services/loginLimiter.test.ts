import { describe, expect, it } from "vitest";
import { ACCOUNT_RULE, LoginLimiter, waitMessage } from "./loginLimiter";

describe("登入次數限制", () => {
  it("同一帳號 15 分鐘內錯 5 次就暫停 15 分鐘", () => {
    let t = 0;
    const limiter = new LoginLimiter(() => t);
    for (let i = 0; i < 4; i++) limiter.recordFailure("a", ACCOUNT_RULE);
    expect(limiter.waitMs("a")).toBe(0);
    limiter.recordFailure("a", ACCOUNT_RULE);
    expect(limiter.waitMs("a")).toBe(15 * 60 * 1000);
    t = 14 * 60 * 1000;
    expect(limiter.waitMs("a")).toBe(60 * 1000);
    t = 15 * 60 * 1000;
    expect(limiter.waitMs("a")).toBe(0);
  });

  it("超過 15 分鐘的錯誤不累計", () => {
    let t = 0;
    const limiter = new LoginLimiter(() => t);
    for (let i = 0; i < 4; i++) limiter.recordFailure("a", ACCOUNT_RULE);
    t = 16 * 60 * 1000;
    limiter.recordFailure("a", ACCOUNT_RULE);
    expect(limiter.waitMs("a")).toBe(0);
  });

  it("登入成功後重新計算", () => {
    const limiter = new LoginLimiter(() => 0);
    for (let i = 0; i < 4; i++) limiter.recordFailure("a", ACCOUNT_RULE);
    limiter.reset("a");
    limiter.recordFailure("a", ACCOUNT_RULE);
    expect(limiter.waitMs("a")).toBe(0);
  });

  it("等待時間以分鐘顯示，至少 1 分鐘", () => {
    expect(waitMessage(10 * 1000)).toBe("密碼錯誤太多次，請 1 分鐘後再試");
    expect(waitMessage(14 * 60 * 1000 + 1)).toBe("密碼錯誤太多次，請 15 分鐘後再試");
  });
});
