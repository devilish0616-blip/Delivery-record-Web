-- 員工資料卡：電話、到職日、緊急聯絡人、駕照種類與到期日
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "hireDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emergencyContact" TEXT;
ALTER TABLE "User" ADD COLUMN "licenseType" TEXT;
ALTER TABLE "User" ADD COLUMN "licenseExpiry" TIMESTAMP(3);
