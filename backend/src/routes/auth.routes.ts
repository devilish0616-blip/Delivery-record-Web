import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken, requireAuth, getUserCapabilities } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { ACCOUNT_RULE, IP_RULE, loginLimiter, waitMessage } from "../services/loginLimiter";
import { audit } from "../services/auditService";

const router = Router();

// Email 一律去空白、轉小寫（手機鍵盤常自動把第一個字母變大寫）
const emailField = z.string().trim().toLowerCase().pipe(z.string().email("Email 格式不正確"));

// 不分大小寫找帳號（舊帳號可能存成大寫）
function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

const registerSchema = z.object({
  email: emailField,
  password: z.string().min(6, "密碼至少需要 6 個字元"),
  name: z.string().min(1, "請輸入姓名"),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
});

// 員工自行註冊（預設角色為 EMPLOYEE，管理者可於後台升級權限）
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { email, password, name } = parsed.data;
    // 此網域保留給不需登入的代管帳號（見 employee.routes 的 NO_LOGIN_EMAIL_DOMAIN）
    if (email.toLowerCase().endsWith("@no-login.local")) {
      return res.status(400).json({ error: "此 Email 無法使用" });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "此 Email 已被註冊" });
    }

    // 系統第一個帳號自動成為管理者，方便初次部署設定
    const userCount = await prisma.user.count();

    if (userCount > 0) {
      const settings = await prisma.salarySettings.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1 },
      });
      if (!settings.registrationEnabled) {
        return res.status(403).json({ error: "目前未開放註冊，請聯絡管理者建立帳號" });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: userCount === 0 ? "ADMIN" : "EMPLOYEE",
      },
    });

    const token = signToken({ id: user.id, role: user.role, email: user.email, name: user.name });
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        capabilities: [],
      },
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "請輸入 Email 與密碼" });
    }
    const { email, password } = parsed.data;

    // 連續打錯太多次先擋下，不比對密碼
    const accountKey = `account:${email}`;
    const ipKey = `ip:${req.ip ?? "unknown"}`;
    const wait = Math.max(loginLimiter.waitMs(accountKey), loginLimiter.waitMs(ipKey));
    if (wait > 0) {
      return res.status(429).json({ error: waitMessage(wait) });
    }
    const fail = () => {
      loginLimiter.recordFailure(accountKey, ACCOUNT_RULE);
      loginLimiter.recordFailure(ipKey, IP_RULE);
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    };

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: {
        jobPositions: { select: { jobPosition: { select: { id: true, name: true } }, since: true } },
        payGrade: { select: { id: true, name: true } },
      },
    });
    if (!user || !user.isActive) {
      return fail();
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return fail();
    }
    loginLimiter.reset(accountKey);
    // 密碼正確後才告知，避免洩漏帳號狀態
    if (!user.canLogin) {
      return res.status(403).json({ error: "此帳號由公司代為管理，目前未開放登入，如需使用請洽管理者" });
    }

    const token = signToken({ id: user.id, role: user.role, email: user.email, name: user.name });
    const capabilities = await getUserCapabilities(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        capabilities,
        jobPositions: user.jobPositions.map((a) => ({ id: a.jobPosition.id, name: a.jobPosition.name, since: a.since })),
        payGradeId: user.payGradeId,
        payGrade: user.payGrade,
      },
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        payGradeId: true,
        payGrade: { select: { id: true, name: true } },
        jobPositions: { select: { jobPosition: { select: { id: true, name: true } }, since: true } },
      },
    });
    if (!user) {
      return res.status(404).json({ error: "找不到使用者" });
    }
    res.json({
      ...user,
      jobPositions: user.jobPositions.map((a) => ({ id: a.jobPosition.id, name: a.jobPosition.name, since: a.since })),
      capabilities: req.user!.capabilities,
      // 每次打開系統換發新憑證，有在用的人不會因為到期被登出
      token: signToken({ id: user.id, role: user.role, email: user.email, name: user.name }),
    });
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "請輸入目前的密碼"),
  newPassword: z.string().min(6, "新密碼至少需要 6 個字元"),
});

// 本人修改密碼：要輸入目前的密碼；改完後其他裝置上的登入會失效，這台換發新憑證繼續使用
router.put(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "輸入資料有誤" });
    }
    const { currentPassword, newPassword } = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: "找不到使用者" });

    const accountKey = `password:${user.id}`;
    const wait = loginLimiter.waitMs(accountKey);
    if (wait > 0) return res.status(429).json({ error: waitMessage(wait) });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      loginLimiter.recordFailure(accountKey, ACCOUNT_RULE);
      return res.status(400).json({ error: "目前的密碼不對" });
    }
    loginLimiter.reset(accountKey);
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: "新密碼不能跟目前的密碼一樣" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), passwordChangedAt: new Date() },
    });
    await audit(req, { category: "EMPLOYEE", action: "OTHER", summary: "本人修改密碼", targetUserId: user.id });
    res.json({ token: signToken({ id: user.id, role: user.role, email: user.email, name: user.name }) });
  })
);

export default router;
