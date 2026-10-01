import { randomUUID } from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  requireAuth,
  requireAdmin,
  requireAdminOrManager,
  isLastActiveAdmin,
  resolveEffectiveCapabilities,
  ALL_CAPABILITIES,
} from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { withDistances } from "../services/mileageService";

const router = Router();
router.use(requireAuth, requireAdminOrManager);

// 管理者：查看所有員工帳號
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isProxyManaged: true,
        canLogin: true,
        accountNote: true,
        originalName: true,
        monthlyAllowance: true,
        extraCapabilities: true,
        payGradeId: true,
        payGrade: { select: { id: true, name: true } },
        jobPositions: {
          select: {
            since: true,
            jobPosition: { select: { id: true, name: true, allowance: true, isActive: true, capabilities: true } },
          },
        },
        createdAt: true,
      },
    });
    res.json(
      users.map((u) => ({
        ...u,
        capabilities: resolveEffectiveCapabilities(u.jobPositions, u.extraCapabilities),
        jobPositions: u.jobPositions.map((a) => ({
          id: a.jobPosition.id,
          name: a.jobPosition.name,
          allowance: a.jobPosition.allowance,
          since: a.since,
        })),
      }))
    );
  })
);

// 不需登入的代管帳號沒有真實 Email，以此網域的內部識別碼佔位（前端顯示為「未設定登入帳號」）
export const NO_LOGIN_EMAIL_DOMAIN = "@no-login.local";
const isPlaceholderEmail = (email: string) => email.endsWith(NO_LOGIN_EMAIL_DOMAIN);

const createSchema = z
  .object({
    name: z.string().trim().min(1, "請輸入顯示名稱").max(50, "名稱最多 50 字"),
    canLogin: z.boolean(),
    email: z.string().trim().email("Email 格式不正確").optional().or(z.literal("")),
    password: z.string().optional(),
    isProxyManaged: z.boolean().default(false),
    accountNote: z.string().trim().max(500, "備註最多 500 字").optional().nullable(),
  })
  .refine((d) => !d.canLogin || (d.email && d.password && d.password.length >= 6), {
    message: "需要登入的帳號請填寫 Email 與至少 6 個字元的密碼",
  });

// 董事長直接建立員工帳號（不經註冊頁、不會切換目前登入身分）；代管帳號可免 Email／密碼
router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { name, canLogin, isProxyManaged, accountNote } = parsed.data;
    const email = parsed.data.email
      ? parsed.data.email.toLowerCase()
      : `proxy-${randomUUID().slice(0, 12)}${NO_LOGIN_EMAIL_DOMAIN}`;
    if (await prisma.user.findUnique({ where: { email } })) {
      return res.status(409).json({ error: "此 Email 已被使用" });
    }
    // 不需登入時仍存一組隨機密碼雜湊（無人知道），日後開放登入再由「重設密碼」設定
    const password = canLogin ? parsed.data.password! : randomUUID();
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "EMPLOYEE",
        canLogin,
        isProxyManaged,
        accountNote: accountNote || null,
      },
      select: { id: true, name: true, email: true },
    });
    res.status(201).json(user);
  })
);

const profileSchema = z.object({
  name: z.string().trim().min(1, "請輸入顯示名稱").max(50, "名稱最多 50 字").optional(),
  email: z.string().trim().email("Email 格式不正確").optional(),
  accountNote: z.string().trim().max(500, "備註最多 500 字").nullable().optional(),
  isProxyManaged: z.boolean().optional(),
  canLogin: z.boolean().optional(),
});

// 修改顯示名稱／帳號備註／代管設定；第一次改名時保留原始名稱供辨識（改名不影響登入帳號與歷史紀錄）
router.patch(
  "/:id/profile",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { name: true, originalName: true, role: true, email: true },
    });
    if (!existing) return res.status(404).json({ error: "找不到此員工" });

    const { name, accountNote, isProxyManaged, canLogin } = parsed.data;
    const email = parsed.data.email?.toLowerCase();
    if (canLogin === false && (req.params.id === req.user!.id || existing.role === "ADMIN")) {
      return res.status(400).json({ error: "不能關閉董事長或自己的登入權限" });
    }
    // 開放登入前必須有真實的登入 Email（代管帳號建立時只有內部識別碼）
    if (canLogin === true && isPlaceholderEmail(email ?? existing.email)) {
      return res.status(400).json({ error: "請先設定登入 Email，並用「重設密碼」設定密碼後再開放登入" });
    }
    if (email && email !== existing.email) {
      if (isPlaceholderEmail(email)) return res.status(400).json({ error: "Email 格式不正確" });
      if (await prisma.user.findUnique({ where: { email } })) {
        return res.status(409).json({ error: "此 Email 已被使用" });
      }
    }
    const renamed = name !== undefined && name !== existing.name;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(renamed ? { name, originalName: existing.originalName ?? existing.name } : {}),
        ...(email && email !== existing.email ? { email } : {}),
        ...(accountNote !== undefined ? { accountNote: accountNote || null } : {}),
        ...(isProxyManaged !== undefined ? { isProxyManaged } : {}),
        ...(canLogin !== undefined ? { canLogin } : {}),
      },
      select: { id: true, name: true, email: true, originalName: true, accountNote: true, isProxyManaged: true, canLogin: true },
    });
    res.json(user);
  })
);

const roleSchema = z.object({ role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]) });

// 設定員工角色（員工 / 主管 / 管理者）
router.patch(
  "/:id/role",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "請提供有效的角色" });
    }
    if (parsed.data.role !== "ADMIN" && (await isLastActiveAdmin(req.params.id))) {
      return res.status(400).json({ error: "此帳號是系統中唯一啟用中的管理者，無法降級，請先指派另一位管理者" });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role },
    });
    res.json(user);
  })
);

const statusSchema = z.object({ isActive: z.boolean() });

// 停用/啟用員工帳號
router.patch(
  "/:id/status",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "請提供有效的狀態" });
    }
    if (!parsed.data.isActive && (await isLastActiveAdmin(req.params.id))) {
      return res.status(400).json({ error: "此帳號是系統中唯一啟用中的管理者，無法停用，請先指派另一位管理者" });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
    });
    res.json(user);
  })
);

const allowanceSchema = z.object({
  monthlyAllowance: z.number().nonnegative(),
});

// 需求11：管理者設定員工固定每月職務加給
router.patch(
  "/:id/allowance",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = allowanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { monthlyAllowance: parsed.data.monthlyAllowance },
    });
    res.json(user);
  })
);

const jobPositionAssignSchema = z.object({
  // 任職起始日（YYYY-MM-DD）；職務加給自此日所屬月份起生效。可省略或傳 null 表示不限（即日起）
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "任職日格式須為 YYYY-MM-DD")
    .nullable()
    .optional(),
});

// 新增一筆職務指派（可複選，重複呼叫同一職務視為更新任職日）
router.post(
  "/:id/job-positions/:jobPositionId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = jobPositionAssignSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { jobPositionId } = req.params;
    const position = await prisma.jobPosition.findUnique({ where: { id: jobPositionId } });
    if (!position) {
      return res.status(404).json({ error: "找不到指定職務" });
    }
    const since = parsed.data.since ? new Date(`${parsed.data.since}T00:00:00`) : null;
    const assignment = await prisma.userJobPosition.upsert({
      where: { userId_jobPositionId: { userId: req.params.id, jobPositionId } },
      update: { since },
      create: { userId: req.params.id, jobPositionId, since },
    });
    res.status(201).json(assignment);
  })
);

// 移除一筆職務指派
router.delete(
  "/:id/job-positions/:jobPositionId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.userJobPosition.deleteMany({
      where: { userId: req.params.id, jobPositionId: req.params.jobPositionId },
    });
    res.status(204).end();
  })
);

const payGradeAssignSchema = z.object({ payGradeId: z.string().nullable() });

// 指派員工職等（單選，傳 null 表示採用預設職等）。職等決定薪資自動計算公式
router.patch(
  "/:id/pay-grade",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = payGradeAssignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "請提供有效的職等" });
    }
    const { payGradeId } = parsed.data;
    if (payGradeId) {
      const grade = await prisma.payGrade.findUnique({ where: { id: payGradeId } });
      if (!grade) {
        return res.status(404).json({ error: "找不到指定職等" });
      }
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { payGradeId },
      select: { id: true, payGradeId: true },
    });
    res.json(user);
  })
);

const capabilitiesSchema = z.object({ capabilities: z.array(z.enum(ALL_CAPABILITIES)) });

// 直接設定員工的網頁使用權限（不透過職務），整組覆蓋，與職務衍生的權限取聯集後生效
router.patch(
  "/:id/capabilities",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = capabilitiesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "請提供有效的權限清單" });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { extraCapabilities: parsed.data.capabilities },
      select: { id: true, extraCapabilities: true },
    });
    res.json(user);
  })
);

const passwordSchema = z.object({
  password: z.string().min(6, "密碼至少需要 6 個字元"),
});

// 需求12：管理者重設員工密碼
router.put(
  "/:id/password",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash },
    });
    res.json({ success: true });
  })
);

// 需求17：查看指定員工所有歷史紀錄（送件/里程/角色/請假/薪資相關），供管理者清理後刪除帳號
router.get(
  "/:id/records",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true },
    });
    if (!target) {
      return res.status(404).json({ error: "找不到指定員工" });
    }

    const [deliveries, mileages, dailyRoles, leaves, deductions] = await Promise.all([
      prisma.deliveryRecord.findMany({
        where: { userId: req.params.id },
        orderBy: { date: "desc" },
      }),
      prisma.mileageRecord.findMany({
        where: { userId: req.params.id },
        include: { vehicle: true },
        orderBy: { date: "desc" },
      }),
      prisma.dailyRoleRecord.findMany({
        where: { userId: req.params.id },
        orderBy: { date: "desc" },
      }),
      prisma.leaveRequest.findMany({
        where: { userId: req.params.id },
        orderBy: { date: "desc" },
      }),
      prisma.salaryDeduction.findMany({
        where: { userId: req.params.id },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
    ]);

    res.json({
      user: target,
      deliveries,
      mileages: await withDistances(mileages),
      dailyRoles,
      leaves,
      deductions,
    });
  })
);

// 需求17：清空指定員工所有歷史紀錄（送件/里程/角色/請假/扣款），供管理者於刪除帳號前使用
router.delete(
  "/:id/records",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ error: "找不到指定員工" });
    }

    await prisma.$transaction([
      prisma.deliveryRecord.deleteMany({ where: { userId: req.params.id } }),
      prisma.mileageRecord.deleteMany({ where: { userId: req.params.id } }),
      prisma.dailyRoleRecord.deleteMany({ where: { userId: req.params.id } }),
      prisma.leaveRequest.deleteMany({ where: { userId: req.params.id } }),
      prisma.salaryDeduction.deleteMany({ where: { userId: req.params.id } }),
    ]);

    res.status(204).end();
  })
);

// 管理者：刪除員工帳號（僅限尚無任何歷史紀錄的帳號；已有紀錄的帳號請改用停用，避免破壞薪資/紀錄資料）
router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: "無法刪除自己的帳號" });
    }

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ error: "找不到指定員工" });
    }

    const [deliveryCount, mileageCount, roleCount, deductionCount] = await Promise.all([
      prisma.deliveryRecord.count({ where: { userId: req.params.id } }),
      prisma.mileageRecord.count({ where: { userId: req.params.id } }),
      prisma.dailyRoleRecord.count({ where: { userId: req.params.id } }),
      prisma.salaryDeduction.count({ where: { userId: req.params.id } }),
    ]);

    if (deliveryCount + mileageCount + roleCount + deductionCount > 0) {
      return res.status(400).json({
        error: "此帳號已有歷史紀錄（送件/里程/角色/扣款等），無法直接刪除，請改用「停用帳號」",
      });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
