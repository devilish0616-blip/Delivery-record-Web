import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// 操作紀錄：重要資料（送件件數、薪資、帳目、審核、員工權限、設定、資產）被新增／修改／刪除時，
// 在各路由處理完後呼叫 audit() 記一筆。寫入失敗只印 log，不影響原本的操作。

export type AuditCategory = "DELIVERY" | "SALARY" | "FINANCE" | "REVIEW" | "EMPLOYEE" | "SETTINGS" | "ASSET";
export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT" | "LOCK" | "UNLOCK" | "IMPORT" | "OTHER";

export type AuditValue = string | number | boolean | null;

export interface AuditChange {
  label: string;
  from: AuditValue;
  to: AuditValue;
}

export interface AuditEntry {
  category: AuditCategory;
  action: AuditAction;
  summary: string;
  targetUserId?: string | null;
  targetName?: string | null; // 帳號已刪除等情況可直接給名字
  changes?: AuditChange[];
}

export async function audit(req: Request, entry: AuditEntry): Promise<void> {
  try {
    let targetName = entry.targetName ?? null;
    if (!targetName && entry.targetUserId) {
      targetName =
        (await prisma.user.findUnique({ where: { id: entry.targetUserId }, select: { name: true } }))?.name ?? null;
    }
    await prisma.auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        actorName: req.user?.name ?? "系統",
        category: entry.category,
        action: entry.action,
        summary: entry.summary,
        targetUserId: entry.targetUserId ?? null,
        targetName,
        changes: entry.changes?.length ? (entry.changes as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error("寫入操作紀錄失敗", err);
  }
}

function normalize(v: unknown): AuditValue {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  return JSON.stringify(v);
}

// 比對前後值，只留有變的欄位。labels 決定要比哪些欄位與顯示名稱；format 可把值轉成好讀的文字（例：角色代碼→中文）
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  labels: Record<string, string>,
  format: Record<string, (v: unknown) => AuditValue> = {}
): AuditChange[] {
  const out: AuditChange[] = [];
  for (const [key, label] of Object.entries(labels)) {
    const fmt = format[key] ?? normalize;
    const from = before ? fmt(before[key]) : null;
    const to = after ? fmt(after[key]) : null;
    if (from !== to) out.push({ label, from: from ?? null, to: to ?? null });
  }
  return out;
}

// 把巢狀設定（例：職等公式）攤平成一層，key 用「.」串起來，方便 diff
export function flatten(obj: unknown, prefix = ""): Record<string, unknown> {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return prefix ? { [prefix]: obj } : {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
  }
  return out;
}

// 職等公式各欄位的中文名稱（沒列到的欄位不比對）
export const PAY_GRADE_LABELS: Record<string, string> = {
  "pieceRate.basePrice": "固定原始單價",
  "pieceRate.attendanceBonus.tier1Days": "出勤第 1 階天數",
  "pieceRate.attendanceBonus.tier1Bonus": "出勤第 1 階加給",
  "pieceRate.attendanceBonus.tier2Days": "出勤第 2 階天數",
  "pieceRate.attendanceBonus.tier2Bonus": "出勤第 2 階加給",
  "pieceRate.attendanceBonus.tier3Days": "出勤第 3 階天數",
  "pieceRate.attendanceBonus.tier3Bonus": "出勤第 3 階加給",
  "pieceRate.averageCountBonus.threshold": "日均件數門檻",
  "pieceRate.averageCountBonus.bonus": "日均件數加給",
  "pieceRate.totalCountBonus.threshold": "總件數門檻",
  "pieceRate.totalCountBonus.bonus": "總件數加給",
  "roleBonus.driverDaily": "司機日加給",
  "roleBonus.attendantDaily": "隨車日加給",
  "incentiveBonus.tier1Days": "激勵獎金高階天數",
  "incentiveBonus.tier1Avg": "激勵獎金高階日均",
  "incentiveBonus.tier1Amount": "激勵獎金高階金額",
  "incentiveBonus.tier2Days": "激勵獎金低階天數",
  "incentiveBonus.tier2Avg": "激勵獎金低階日均",
  "incentiveBonus.tier2Amount": "激勵獎金低階金額",
  formulaNotes: "公式說明",
};

export const ROLE_TYPE_LABEL: Record<string, string> = { NONE: "無", TRUCK_DRIVER: "貨車司機", TRUCK_ATTENDANT: "隨車" };
export const USER_ROLE_LABEL: Record<string, string> = { ADMIN: "董事長", MANAGER: "執行長", EMPLOYEE: "員工" };
export const CAPABILITY_LABEL: Record<string, string> = {
  MANAGE_VEHICLES: "車輛管理",
  MANAGE_FINANCE: "記帳",
  PROXY_DELIVERY: "代填送件",
};

export const DELIVERY_LABELS = { forwardCount: "正物流", reverseCount: "逆物流", note: "備註" };
export const roleText = (v: unknown) => (v ? ROLE_TYPE_LABEL[String(v)] ?? String(v) : null);

export function md(date: Date | string): string {
  const s = typeof date === "string" ? date : date.toISOString().slice(0, 10);
  const [, m, d] = s.split("-").map(Number);
  return `${m}/${d}`;
}

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// 「正物流 58 → 580、逆物流 6 → 4」
export function changeText(changes: AuditChange[]): string {
  const show = (v: AuditValue) => (v === null ? "（無）" : typeof v === "boolean" ? (v ? "是" : "否") : String(v));
  return changes.map((c) => `${c.label} ${show(c.from)} → ${show(c.to)}`).join("、");
}
