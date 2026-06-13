# 物流員工管理系統

依據 `logistics_system_prompt.md` 規格實作的物流員工管理系統，包含首頁公告與行事曆、每日送件記錄、車輛里程記錄、請假申請與審核、薪資計算（含薪資單 PDF 匯出）、司機/隨車人員派遣、貨運行 Excel 對帳、後台基礎設定與管理者儀表板。

詳細開發歷程與各功能決策請見 `討論紀錄_2026_06_13.md`。

## 技術架構

- **後端**：Node.js + Express + TypeScript + Prisma + PostgreSQL
- **前端**：React + Vite + TypeScript + Tailwind CSS + React Router
- **認證**：JWT（第一個註冊的帳號會自動成為管理者 ADMIN；後台「開放員工自行註冊」開關關閉時，`/register` 僅允許建立第一個帳號）
- **角色**：ADMIN（管理者）、MANAGER（主管，可查看所有後台資訊但原則上不可編輯）、EMPLOYEE（員工）
- **部署**：Railway（push 到 GitHub `main` 分支後自動重新部署並執行 `prisma migrate deploy`），本機開發以 `npx prisma generate` / `npx tsc --noEmit` / `npm run build` 做語法檢查為主

## 專案結構

```
backend/   Express API（路由、Prisma schema、薪資/對帳/車輛等業務邏輯）
frontend/  React 前端（員工/管理者頁面、路由、API client）
```

## 啟動方式

正式環境部署於 Railway（PostgreSQL），本機開發環境無法連接該資料庫，因此本機僅用於語法/型別檢查與前端介面開發：

### 1. 後端 API（語法檢查／編譯）

```powershell
cd backend
npm install
npm run prisma:generate
npx tsc --noEmit
npm run build
```

環境變數設定於 `backend/.env`（可參考 `.env.example`）：

```
DATABASE_URL="postgresql://..."
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

前端開發伺服器已設定 `/api` proxy 轉發至後端的 `http://localhost:4000`，因此開發時兩個伺服器需同時啟動（後端需連到可用的 PostgreSQL）。

## 帳號

- 第一個透過「註冊」建立的帳號會自動成為管理者（ADMIN）。
- 後台「開放員工自行註冊」開關關閉後，`/register` 僅允許建立第一個帳號，其餘員工帳號由管理者於「員工管理」建立。
- 正式環境（Railway）已有兩組測試帳號，可直接登入體驗各模組：
  - 管理者：`test-admin@example.com` / `test1234`
  - 一般員工：`test-employee@example.com` / `test1234`

## 已實作的模組

1. **首頁（公告欄＋行事曆）**：單則公告（ADMIN/MANAGER 可編輯）；當月行事曆顯示已核准請假與公司活動（ADMIN/MANAGER 可新增/刪除活動）
2. **每日送件記錄**：正/逆物流件數、備註、今日角色（貨車司機/貨車隨車人員），每人每日一筆（可更新）
3. **車輛里程記錄**：機車（必填）/貨車（選填）下拉選單、起訖里程、自動計算距離、自動帶入操作人員
4. **請假申請與審核**：員工可申請/查看/取消請假，ADMIN/MANAGER 於「請假管理」頁核准或拒絕
5. **薪資計算**：依出勤天數與日平均件數自動判定職稱（資深員工/員工/臨時工 × 高/低），管理者可逐月手動覆蓋；含職務加給、貨車司機/隨車加給、激勵獎金、扣款項目；管理者可編輯或刪除員工某日的送件記錄；單一員工薪資單匯出 PDF（內嵌 Logo 與思源黑體），全公司薪資總表匯出 Excel
6. **司機/隨車人員派遣**：依每日角色與里程紀錄即時統計司機/隨車加給天數
7. **貨運行 Excel 對帳**：上傳月結 Excel，自動比對系統件數、計算 9% 抽成與實收金額
8. **後台基礎設定**：車輛管理（機車/貨車分類、保養提醒、維修登記）、員工帳號與職稱管理（含重設密碼、刪除帳號）、薪資加給/扣款設定、每月收入單價（稅前/稅後）設定、註冊開關
9. **管理者儀表板**：可選擇查看任一年月，當日/當月統計、預估營收與毛利、車輛狀況、待處理事項提醒、快速連結
10. **角色權限**：ADMIN（完整權限）、MANAGER（可查看所有後台資訊，並可管理保養項目與每日角色、審核請假）、EMPLOYEE（僅自己的資料）

## 開發狀態 / 後續可優化方向

- 詳細功能演進與決策記錄於 `討論紀錄_2026_06_13.md`，目前所有已討論需求皆已完成並部署。
- 尚未撰寫自動化測試（unit/e2e）。
- 薪資、對帳等規則若需依實際營運微調（例如職稱判定門檻、抽成比例），可調整 `backend/src/services` 內對應檔案。
