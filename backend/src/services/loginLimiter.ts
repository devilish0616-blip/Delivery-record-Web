// 登入次數限制：同一個帳號連續打錯密碼、或同一個網路打錯太多次，就暫停一段時間不能登入，避免被一直猜密碼。
// 正式站只有一台伺服器，計數放在記憶體即可；伺服器重開會歸零，不影響安全性的大方向。

export interface LimitRule {
  maxFailures: number; // 在 windowMs 內打錯幾次就鎖
  windowMs: number;
  lockMs: number;
}

// 同一個帳號：15 分鐘內錯 5 次，鎖 15 分鐘
export const ACCOUNT_RULE: LimitRule = { maxFailures: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };
// 同一個網路（IP）：15 分鐘內錯 30 次，鎖 15 分鐘（公司同一個 Wi-Fi 多人登入不會互相卡住）
export const IP_RULE: LimitRule = { maxFailures: 30, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };

interface Entry {
  failures: number[]; // 打錯的時間
  lockedUntil: number;
}

export class LoginLimiter {
  private entries = new Map<string, Entry>();

  constructor(private now: () => number = Date.now) {}

  // 還要等幾毫秒才能再試；0 表示可以登入
  waitMs(key: string): number {
    const e = this.entries.get(key);
    if (!e) return 0;
    return Math.max(0, e.lockedUntil - this.now());
  }

  recordFailure(key: string, rule: LimitRule): void {
    const t = this.now();
    const e = this.entries.get(key) ?? { failures: [], lockedUntil: 0 };
    e.failures = e.failures.filter((f) => t - f < rule.windowMs);
    e.failures.push(t);
    if (e.failures.length >= rule.maxFailures) {
      e.lockedUntil = t + rule.lockMs;
      e.failures = [];
    }
    this.entries.set(key, e);
    this.prune(t);
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  // 清掉已過期的紀錄，避免記憶體一直變大
  private prune(t: number): void {
    if (this.entries.size < 1000) return;
    for (const [key, e] of this.entries) {
      if (e.lockedUntil < t && e.failures.every((f) => t - f >= Math.max(ACCOUNT_RULE.windowMs, IP_RULE.windowMs))) {
        this.entries.delete(key);
      }
    }
  }
}

export function waitMessage(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return `密碼錯誤太多次，請 ${minutes} 分鐘後再試`;
}

export const loginLimiter = new LoginLimiter();
