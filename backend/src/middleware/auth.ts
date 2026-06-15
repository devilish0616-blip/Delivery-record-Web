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
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"],
  });
}

// 重新查詢資料庫中的最新角色與帳號狀態，避免管理者調整權限後，
// 使用者需等到 token 過期或重新登入才會套用新權限
export const requireAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未提供有效的登入憑證" });
  }

  const token = header.slice("Bearer ".length);
  let payload: AuthUser;
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return res.status(401).json({ error: "登入憑證無效或已過期" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, role: true, email: true, name: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "登入憑證無效或已過期" });
  }

  req.user = { id: user.id, role: user.role, email: user.email, name: user.name };
  next();
});

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
