import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  name: string;
  capabilities: string[];
  // 是否為至少一個區域的主管（來源：RegionMember.isManager，與 role 權限等級互相獨立）
  isRegionManager: boolean;
}

// JWT 內僅存放身分（不含 capabilities，capabilities 每次請求由資料庫即時解析，避免授權變更後 token 過期前仍生效）
export type TokenPayload = Pick<AuthUser, "id" | "role" | "email" | "name">;

// 職務可授予的模組權限鍵（未來擴充模組時於此新增）
// MANAGE_FINANCE：可用記帳頁與帳務月報；記的帳為待審核，需董事長核准才計入報表
// PROXY_DELIVERY：代填送件（替「代管帳號」填寫每日送件，範圍同執行長）
// （原 MANAGE_SCHEDULE 排班權限已隨排班功能移除；resolveEffectiveCapabilities 會過濾掉不再存在的舊值）
export const ALL_CAPABILITIES = ["MANAGE_VEHICLES", "MANAGE_FINANCE", "PROXY_DELIVERY"] as const;
export type Capability = (typeof ALL_CAPABILITIES)[number];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// 正式環境必須設定 JWT_SECRET，否則 token 會以已知的開發用密鑰簽發，
// 任何人都能偽造管理者身分。缺少時直接讓服務啟動失敗，避免帶著漏洞上線。
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("缺少必要環境變數 JWT_SECRET，請於部署環境設定後再啟動服務");
    }
    return "dev-secret";
  }
  return secret;
})();

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"],
  });
}

// 合併「所有已指派且啟用中的職務 capabilities」與「直接授予的 extraCapabilities」為聯集，
// 供 requireAuth／getUserCapabilities／員工列表 API 共用同一份邏輯
export function resolveEffectiveCapabilities(
  jobPositions: { jobPosition: { capabilities: unknown; isActive: boolean } }[],
  extraCapabilities: unknown
): string[] {
  const fromJobPositions = jobPositions
    .filter((a) => a.jobPosition.isActive)
    .flatMap((a) => (Array.isArray(a.jobPosition.capabilities) ? (a.jobPosition.capabilities as string[]) : []));
  const extra = Array.isArray(extraCapabilities) ? (extraCapabilities as string[]) : [];
  const known = new Set<string>(ALL_CAPABILITIES);
  return Array.from(new Set([...fromJobPositions, ...extra])).filter((c) => known.has(c));
}

// 解析某員工目前生效的模組權限：職務聯集（僅啟用中職務）與直接授予的 extraCapabilities 取聯集
export async function getUserCapabilities(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      extraCapabilities: true,
      jobPositions: { select: { jobPosition: { select: { capabilities: true, isActive: true } } } },
    },
  });
  if (!user) {
    return [];
  }
  return resolveEffectiveCapabilities(user.jobPositions, user.extraCapabilities);
}

// 判斷某使用者是否至少為一個區域的主管（RegionMember.isManager 為唯一來源，與 role 無關）
export async function isUserRegionManager(userId: string): Promise<boolean> {
  const membership = await prisma.regionMember.findFirst({
    where: { userId, isManager: true },
    select: { id: true },
  });
  return !!membership;
}

// 重新查詢資料庫中的最新角色與帳號狀態，避免管理者調整權限後，
// 使用者需等到 token 過期或重新登入才會套用新權限
export const requireAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未提供有效的登入憑證" });
  }

  const token = header.slice("Bearer ".length);
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return res.status(401).json({ error: "登入憑證無效或已過期" });
  }

  const [user, isRegionManager] = await Promise.all([
    prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        role: true,
        email: true,
        name: true,
        isActive: true,
        canLogin: true,
        extraCapabilities: true,
        jobPositions: { select: { jobPosition: { select: { capabilities: true, isActive: true } } } },
      },
    }),
    isUserRegionManager(payload.id),
  ]);
  // 關閉登入後，已登入的裝置也立即失效
  if (!user || !user.isActive || !user.canLogin) {
    return res.status(401).json({ error: "登入憑證無效或已過期" });
  }

  const capabilities = resolveEffectiveCapabilities(user.jobPositions, user.extraCapabilities);

  req.user = {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    capabilities,
    isRegionManager,
  };
  next();
});

// 授權守衛：ADMIN/MANAGER 一律放行；或（若 allowRegionManager）為區域主管；或員工具備對應職務 capability
export function requireCapability(capability: Capability, options?: { allowRegionManager?: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (
      role === "ADMIN" ||
      role === "MANAGER" ||
      (options?.allowRegionManager && req.user?.isRegionManager) ||
      req.user?.capabilities?.includes(capability)
    ) {
      return next();
    }
    return res.status(403).json({ error: "權限不足，需具備對應職務權限" });
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "此操作需要管理者權限" });
  }
  next();
}

// 允許管理者或主管查看後台資訊（主管僅可查看，不可修改資料）
export function requireAdminOrManager(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN" && req.user?.role !== "MANAGER") {
    return res.status(403).json({ error: "此操作需要管理者或主管權限" });
  }
  next();
}

// 允許管理者、主管或區域主管存取；區域主管可見範圍由各路由依 getManagedUserIds 過濾
export function requireAdminManagerOrRegionManager(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN" && req.user?.role !== "MANAGER" && !req.user?.isRegionManager) {
    return res.status(403).json({ error: "此操作需要管理者、主管或區域主管權限" });
  }
  next();
}

// 保底防呆：判斷某使用者是否為系統中「唯一一位啟用中的 ADMIN」。
// 用於降級角色／停用帳號前檢查，避免操作後系統沒有任何人能再登入後台管理。
export async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!target || target.role !== "ADMIN" || !target.isActive) {
    return false;
  }
  const activeAdminCount = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
  return activeAdminCount <= 1;
}

// 取得某位區域經理所管轄的所有成員 userId（含自己）
// regionId 可選，限定只查詢該區域；未提供則回傳所有管轄區域成員的聯集
export async function getManagedUserIds(userId: string, regionId?: string): Promise<string[]> {
  const managedRegions = await prisma.regionMember.findMany({
    where: { userId, isManager: true, ...(regionId ? { regionId } : {}) },
    select: { regionId: true },
  });
  const regionIds = managedRegions.map((r) => r.regionId);
  if (regionIds.length === 0) {
    return [];
  }
  const members = await prisma.regionMember.findMany({
    where: { regionId: { in: regionIds } },
    select: { userId: true },
  });
  return Array.from(new Set(members.map((m) => m.userId)));
}
