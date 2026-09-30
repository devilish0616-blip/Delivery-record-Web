-- AlterTable: 是否允許本人登入（預設允許，不影響既有帳號）
ALTER TABLE "User" ADD COLUMN "canLogin" BOOLEAN NOT NULL DEFAULT true;
