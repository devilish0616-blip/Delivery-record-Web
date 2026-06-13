import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "密碼至少需要 6 個字元"),
  name: z.string().min(1, "請輸入姓名"),
});

const loginSchema = z.object({
  email: z.string().email(),
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

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "此 Email 已被註冊" });
    }

    // 系統第一個帳號自動成為管理者，方便初次部署設定
    const userCount = await prisma.user.count();
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
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }

    const token = signToken({ id: user.id, role: user.role, email: user.email, name: user.name });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
        specialTitle: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!user) {
      return res.status(404).json({ error: "找不到使用者" });
    }
    res.json(user);
  })
);

export default router;
