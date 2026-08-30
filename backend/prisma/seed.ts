// 保底開發者帳號：確保一組固定 ADMIN 帳號存在，供職等/職務/權限設定失誤時的緊急登入使用。
// 執行：npm run seed（可重複執行，依 email upsert，不會建立重複帳號）
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.DEV_ADMIN_EMAIL;
  const password = process.env.DEV_ADMIN_PASSWORD;
  const name = process.env.DEV_ADMIN_NAME || "系統開發者";

  if (!email || !password) {
    throw new Error("請先在 .env 設定 DEV_ADMIN_EMAIL 與 DEV_ADMIN_PASSWORD 後再執行 npm run seed");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", isActive: true },
    create: { email, name, passwordHash, role: "ADMIN", isActive: true },
  });

  console.log(`保底開發者帳號已就緒：${user.email}（id: ${user.id}）`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
