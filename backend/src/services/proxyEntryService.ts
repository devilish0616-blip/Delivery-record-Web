import { prisma } from "../lib/prisma";
import type { AuthUser } from "../middleware/auth";

// 代填（送件、加油回報、停車費回報）共用的對象範圍：
// 執行長與具「代填送件」職務權限者只能代填「代管帳號」；董事長可代填所有啟用中的員工（scope=all）

export function canProxyEnter(user: AuthUser): boolean {
  return user.role === "ADMIN" || user.role === "MANAGER" || user.capabilities.includes("PROXY_DELIVERY");
}

export async function proxyTargets(role: string, scope: string | undefined) {
  const all = role === "ADMIN" && scope === "all";
  return prisma.user.findMany({
    where: { isActive: true, ...(all ? {} : { isProxyManaged: true }) },
    select: { id: true, name: true, accountNote: true, isProxyManaged: true },
    orderBy: [{ isProxyManaged: "desc" }, { name: "asc" }],
  });
}

// 檢查 user 能否替 targetId 代填；可以時回傳 null，否則回傳 { status, error }
export async function checkProxyTarget(
  user: AuthUser,
  targetId: string
): Promise<{ status: number; error: string } | null> {
  if (!canProxyEnter(user)) return { status: 403, error: "權限不足，需具備代填權限" };
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { name: true, isActive: true, isProxyManaged: true },
  });
  if (!target || !target.isActive) return { status: 400, error: "找不到指定的員工或帳號已停用" };
  if (user.role !== "ADMIN" && !target.isProxyManaged) {
    return { status: 403, error: `「${target.name}」不是代管帳號，只有董事長可以代填一般員工` };
  }
  return null;
}
