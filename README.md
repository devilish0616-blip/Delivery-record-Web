# 物流員工管理系統

依據 `logistics_system_prompt.md` 規格實作的物流員工管理系統，包含每日送件記錄、車輛里程記錄、薪資計算、司機/隨車人員派遣、貨運行 Excel 對帳、後台基礎設定與管理者儀表板。

## 技術架構

- **後端**：Node.js + Express + TypeScript + Prisma + SQLite（資料存於 `backend/prisma/dev.db` 單一檔案，無需另外架設資料庫伺服器）
- **前端**：React + Vite + TypeScript + Tailwind CSS + React Router
- **認證**：JWT（第一個註冊的帳號會自動成為管理者 ADMIN，其餘為一般員工 EMPLOYEE）

## 專案結構

```
backend/   Express API（路由、Prisma schema、薪資/對帳/車輛等業務邏輯）
frontend/  React 前端（員工/管理者頁面、路由、API client）
```

## 啟動方式

### 1. 後端 API（預設 http://localhost:4000）

```powershell
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate   # 第一次執行會建立 dev.db 並套用 migration
npm run dev
```

環境變數設定於 `backend/.env`（可參考 `.env.example`）：

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-this-secret-in-production"
JWT_EXPIRES_IN="7d"
PORT=4000
SUPPLIER_COMMISSION_RATE=0.09
```

### 2. 前端網站（預設 http://localhost:5173）

```powershell
cd frontend
npm install
npm run dev
```

前端開發伺服器已設定 `/api` proxy 轉發至後端的 `http://localhost:4000`，因此開發時兩個伺服器需同時啟動。

## 帳號

- 第一個透過「註冊」建立的帳號會自動成為管理者（ADMIN）。
- 目前資料庫中已有兩組測試帳號，可直接登入體驗各模組（含範例資料：車輛、送件記錄、里程、派遣、薪資設定、單價設定、對帳紀錄）：
  - 管理者：`test-admin@example.com` / `test1234`
  - 一般員工：`test-employee@example.com` / `test1234`

## 已實作的模組

1. **每日送件記錄**：正/逆物流件數、備註，每人每日一筆（可更新）
2. **車輛里程記錄**：車輛下拉選單、起訖里程、自動計算距離、自動帶入操作人員
3. **薪資計算**：依出勤天數與日平均件數自動判定職稱（資深員工/員工/臨時工 × 高/低），管理者可逐月手動覆蓋；可匯出 Excel 薪資報表（總表 + 每人明細）
4. **司機/隨車人員派遣**：每日派遣紀錄與司機/隨車加給計算
5. **貨運行 Excel 對帳**：上傳月結 Excel，自動比對系統件數、計算 9% 抽成與實收金額
6. **後台基礎設定**：車輛管理（含換機油提醒）、員工帳號與職稱管理、薪資加給設定、每月收入單價（稅前/稅後）設定
7. **管理者儀表板**：當日/當月統計、預估營收與毛利、車輛狀況、待處理事項提醒、快速連結

## 開發狀態 / 後續可優化方向

- 目前已涵蓋規格中全部 7 個模組的前後端串接與核心業務邏輯，可直接登入操作。
- 尚未撰寫自動化測試（unit/e2e）。
- 薪資、對帳等規則若需依實際營運微調（例如職稱判定門檻、抽成比例），可調整 `backend/src/services` 內對應檔案。
