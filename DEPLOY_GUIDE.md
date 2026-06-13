# 物流員工管理系統 — Railway 部署指南

## 目前完成的事情（給 AI 助手的背景說明）

使用者已經完成以下步驟：

1. 在本機成功啟動後端（`http://localhost:4000`）與前端（`http://localhost:5173`）
2. 安裝了 Git
3. 設定了 Git 全域帳號（email + name）
4. 將整個專案上傳到 GitHub：`https://github.com/devilish0616-blip/Delivery-record-Web`
5. 在 Railway 完成 GitHub 登入

**下一步目標：在 Railway 部署後端與前端，讓系統可以 24 小時從任何地點存取，不需要開啟本機電腦。**

---

## 專案技術架構

- 後端：Node.js + Express + TypeScript + Prisma
- 前端：React + Vite + TypeScript + Tailwind CSS
- 資料庫：目前是 SQLite（`backend/prisma/dev.db`）→ 部署時需換成 PostgreSQL
- 認證：JWT

---

## Railway 部署步驟（請 AI 助手帶使用者完成）

### 重要提醒
- 使用者是技術新手，請一步一步說明，不要一次給太多指令
- 使用者使用 Windows 10，命令提示字元（cmd）操作
- 專案路徑：`C:\Users\user\Desktop\VS Code\New`
- GitHub repo：`https://github.com/devilish0616-blip/Delivery-record-Web`

---

### 步驟一：在 Railway 建立 PostgreSQL 資料庫

1. 進入 Railway 控制台 `https://railway.app/dashboard`
2. 點 **New Project**
3. 選 **Deploy PostgreSQL**
4. 等待建立完成後，點進去找 **DATABASE_URL**（在 Variables 頁籤）
5. 複製那串連線字串備用

---

### 步驟二：修改後端的 Prisma schema，改用 PostgreSQL

檔案位置：`backend/prisma/schema.prisma`

將：
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

改成：
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

### 步驟三：修改後端的 package.json，加入啟動指令

檔案位置：`backend/package.json`

在 `scripts` 區塊加入：
```json
"start": "node dist/index.js",
"build": "tsc"
```

---

### 步驟四：在根目錄建立 railway.toml（後端設定）

在專案根目錄（`C:\Users\user\Desktop\VS Code\New`）建立 `railway.toml`：

```toml
[build]
buildCommand = "cd backend && npm install && npm run build && npx prisma migrate deploy"

[deploy]
startCommand = "cd backend && npm run start"
```

---

### 步驟五：前端修改 API 位址

前端目前是透過 Vite proxy 連後端，部署後需要改成直接連 Railway 後端的網址。

檔案位置：`frontend/src/api/client.ts`

將 API base URL 改成環境變數方式讀取，例如：
```typescript
const BASE_URL = import.meta.env.VITE_API_URL || '/api'
```

並在前端根目錄建立 `.env.production`：
```
VITE_API_URL=https://你的後端Railway網址
```

---

### 步驟六：推送修改到 GitHub

```cmd
cd "C:\Users\user\Desktop\VS Code\New"
git add .
git commit -m "prepare for railway deployment"
git push
```

---

### 步驟七：在 Railway 部署後端服務

1. Railway 控制台 → 點你的 Project
2. **New Service** → **GitHub Repo**
3. 選 `Delivery-record-Web`
4. 設定環境變數（Variables）：
   - `DATABASE_URL`：貼上剛才複製的 PostgreSQL 連線字串
   - `JWT_SECRET`：自訂一個密碼，例如 `my-super-secret-2024`
   - `JWT_EXPIRES_IN`：`7d`
   - `PORT`：`4000`
   - `SUPPLIER_COMMISSION_RATE`：`0.09`
5. 等待部署完成，取得後端網址（例如 `https://xxx.railway.app`）

---

### 步驟八：在 Railway 部署前端服務

1. 同一個 Project → **New Service** → **GitHub Repo**
2. 選同一個 repo
3. 設定：
   - Root Directory：`frontend`
   - Build Command：`npm install && npm run build`
   - Start Command：`npx serve dist`
4. 設定環境變數：
   - `VITE_API_URL`：後端的 Railway 網址
5. 部署完成後取得前端網址，這就是使用者以後的登入網址

---

## 測試帳號

| 角色 | 帳號 | 密碼 |
|------|------|------|
| 管理者 | test-admin@example.com | test1234 |
| 一般員工 | test-employee@example.com | test1234 |

---

## 注意事項

- SQLite 改成 PostgreSQL 後，原本的測試資料會消失，需要重新建立
- 如果使用者想保留測試資料，可以在本機先匯出資料再匯入，但這較複雜，可以先跳過
- Railway 免費額度每月有限制，超過需付費（約 $5 美金/月）
