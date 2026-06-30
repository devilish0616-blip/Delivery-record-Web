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
}

// JWT 內僅存放身分（不含 capabilities，capabilities 每次請求由資料庫即時解析，避免授權變更後 token 過期前仍生效）
export type TokenPayload = Pick<AuthUser, "id" | "role" | "email" | "name">;

// 職務可授予的模組權限鍵（未來擴充模組時於此新增）
export const ALL_CAPABILITIES = ["MANAGE_VEHICLES", "MANAGE_SCHEDULE"] as const;
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

// 解析某員工目前生效的模組權限：僅啟用中的職務才授予 capabilities
export async function getUserCapabilities(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { jobPosition: { select: { capabilities: true, isActive: true } } },
  });
  if (!user?.jobPosition || !user.jobPosition.isActive) {
    return [];
  }
  return Array.isArray(user.jobPosition.capabilities)
    ? (user.jobPosition.capabilities as string[])
    : [];
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

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      role: true,
      email: true,
      name: true,
      isActive: true,
      jobPosition: { select: { capabilities: true, isActive: true } },
    },
  });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "登入憑證無效或已過期" });
  }

  const capabilities =
    user.jobPosition && user.jobPosition.isActive && Array.isArray(user.jobPosition.capabilities)
      ? (user.jobPosition.capabilities as string[])
      : [];

  req.user = { id: user.id, role: user.role, email: user.email, name: user.name, capabilities };
  next();
});

// 授權守衛：ADMIN/MANAGER 一律放行；或指定額外角色；或員工具備對應職務 capability
export function requireCapability(capability: Capability, ...extraRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (
      role === "ADMIN" ||
      role === "MANAGER" ||
      (role && extraRoles.includes(role)) ||
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

// 允許管理者、主管或區域經理存取；區域經理可見範圍由各路由依 getManagedUserIds 過濾
export function requireAdminManagerOrRegionManager(req: Request, res: Response, next: NextFunction) {
  if (
    req.user?.role !== "ADMIN" &&
    req.user?.role !== "MANAGER" &&
    req.user?.role !== "REGION_MANAGER"
  ) {
    return res.status(403).json({ error: "此操作需要管理者、主管或區域經理權限" });
  }
  next();
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
