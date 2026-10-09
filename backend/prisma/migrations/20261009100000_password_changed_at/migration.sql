-- 改密碼後讓舊的登入憑證失效（其他裝置自動登出）
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
