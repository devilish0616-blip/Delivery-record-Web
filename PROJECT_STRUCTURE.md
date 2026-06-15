# 專案結構說明

本文件整理「物流員工管理系統」的目錄與檔案結構，方便快速找到對應功能的程式碼。
專案總覽與功能清單請見 [README.md](README.md)；部署流程請見 [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md)；開發歷程與決策請見 [討論紀錄_2026_06_14.md](討論紀錄_2026_06_14.md)。

## 根目錄總覽

```
.
├── README.md                          專案說明（架構、角色權限、模組清單、啟動方式）
├── DEPLOY_GUIDE.md                     Railway 部署指南
├── logistics_system_prompt.md          原始需求規格文件
├── 討論紀錄_2026_06_14.md               開發歷程與功能決策記錄
├── railway.toml                        Railway 後端部署設定（build/migrate/start）
├── logo_透明背景.png                    系統 Logo（透明背景，供前端/PDF使用）
├── delivery-record.zip                 送件記錄相關備份/參考資料
├── 【外包】宇安-配送費(115.05.xlsx       貨運行月結對帳範例 Excel
├── backend/                             後端 API（Express + TypeScript + Prisma）
└── frontend/                            前端網站（React + Vite + TypeScript）
```

## backend/ 後端

```
backend/
├── .env / .env.example                 環境變數（DATABASE_URL、JWT_SECRET、PORT）
├── package.json                        依賴與指令（dev/build/prisma:*）
├── tsconfig.json                       TypeScript 設定
├── prisma/
│   ├── schema.prisma                   資料庫 Schema（User、各業務 model、enum）
│   ├── dev.db                          本機開發用 SQLite 資料庫
│   ├── migrations/                     資料庫遷移紀錄（依時間排序）
│   │   ├── 20260613000000_init                                       初始 schema
│   │   ├── 20260613100000_add_registration_toggle_and_salary_deduction  註冊開關＋薪資扣款
│   │   ├── 20260613110000_add_manager_role                            新增 MANAGER 角色
│   │   ├── 20260613120000_vehicle_type_and_maintenance                車輛類型＋保養項目
│   │   ├── 20260613130000_supervisor_daily_role_and_allowance         主管權限＋每日角色加給
│   │   ├── 20260613140000_announcement_calendar_leave                 公告／行事曆／請假
│   │   ├── 20260613150000_rename_daily_role_type_values               每日角色 enum 改名
│   │   ├── 20260614000000_reconciliation_forward_reverse_breakdown    對帳正逆物流拆分
│   │   └── 20260614010000_mileage_end_only                            里程改為僅記結束里程
│   └── migration_lock.toml
└── src/
    ├── index.ts                        Express 入口，註冊所有路由與中介層
    ├── assets/                         PDF 用素材（Logo、思源黑體字型）
    ├── lib/
    │   └── prisma.ts                   Prisma Client 單例
    ├── middleware/
    │   ├── auth.ts                     JWT 驗證、角色權限檢查
    │   └── errorHandler.ts             統一錯誤處理
    ├── utils/
    │   ├── asyncHandler.ts             包裝 async route handler 例外捕捉
    │   └── date.ts                     日期處理工具
    ├── routes/                         API 路由（對應 /api/* ）
    │   ├── auth.routes.ts              登入／註冊／JWT 發行
    │   ├── delivery.routes.ts          每日送件記錄（正/逆物流件數）
    │   ├── mileage.routes.ts           車輛里程記錄
    │   ├── dailyRole.routes.ts         今日角色（司機/隨車人員）
    │   ├── vehicle.routes.ts           車輛管理與保養提醒
    │   ├── dispatch.routes.ts          派遣紀錄（依角色＋里程即時統計）
    │   ├── leave.routes.ts             請假申請與審核
    │   ├── salary.routes.ts            薪資計算、薪資單 PDF／總表 Excel 匯出
    │   ├── reconciliation.routes.ts    貨運行 Excel 月結對帳
    │   ├── employee.routes.ts          員工帳號與歷史紀錄管理
    │   ├── settings.routes.ts          後台基礎設定（加給/單價/註冊開關）
    │   ├── dashboard.routes.ts         管理者儀表板統計
    │   ├── announcement.routes.ts      首頁公告
    │   └── event.routes.ts             行事曆活動
    └── services/                       業務邏輯層
        ├── mileageService.ts           依前一筆紀錄推算當日行駛里程
        ├── pricingService.ts           月度正/逆物流單價與稅後金額計算
        ├── salaryService.ts            職稱判定、加給、激勵獎金、扣款等薪資邏輯
        ├── salaryPdfService.tsx        薪資單 PDF 產生（@react-pdf/renderer）
        ├── reconciliationService.ts    解析貨運行 Excel、計算對帳差異
        └── vehicleService.ts           車輛保養項目與維修登記邏輯
```

## frontend/ 前端

```
frontend/
├── index.html                          HTML 進入點
├── package.json                        依賴與指令（dev/build/lint）
├── vite.config.ts                      Vite 設定（含 /api proxy）
├── eslint.config.js                    ESLint 設定
├── tsconfig*.json                      TypeScript 設定
├── railway.toml                        Railway 前端部署設定（serve dist）
├── public/                             靜態資源（favicon、logo）
└── src/
    ├── main.tsx                        React 進入點
    ├── App.tsx                         路由設定（依角色導向不同頁面）
    ├── index.css                       Tailwind 全域樣式
    ├── api/
    │   ├── client.ts                   axios 實例（attach JWT、baseURL）
    │   └── types.ts                    API 請求/回應型別定義
    ├── auth/
    │   ├── AuthContext.tsx             登入狀態與使用者資訊 Context
    │   └── ProtectedRoute.tsx          路由保護（依角色限制存取）
    ├── components/
    │   └── ErrorBoundary.tsx           全域錯誤邊界
    ├── layouts/
    │   └── AppLayout.tsx               主版面與側邊導覽列（依角色/部門分類）
    └── pages/
        ├── HomePage.tsx                首頁（公告欄＋行事曆）
        ├── LoginPage.tsx                登入頁
        ├── RegisterPage.tsx             註冊頁
        ├── admin/                       ADMIN / MANAGER 頁面
        │   ├── DashboardPage.tsx        管理者儀表板（月結統計、每日營運總表）
        │   ├── DispatchPage.tsx         派遣紀錄（今日角色校正、里程編輯）
        │   ├── EmployeeRecordsPage.tsx  員工歷史紀錄管理（僅 ADMIN）
        │   ├── EmployeesPage.tsx        員工帳號與角色管理
        │   ├── LeaveManagementPage.tsx  請假審核
        │   ├── ReconciliationPage.tsx   貨運行 Excel 對帳
        │   ├── SalaryPage.tsx           薪資計算與匯出
        │   ├── SettingsPage.tsx         後台基礎設定（僅 ADMIN）
        │   └── VehiclesPage.tsx         車輛管理與保養
        └── employee/                    EMPLOYEE 頁面
            ├── DailyDeliveryPage.tsx    每日送件記錄填寫
            ├── LeaveRequestPage.tsx     請假申請
            ├── MileagePage.tsx          車輛里程記錄填寫
            └── MySalaryPage.tsx         我的薪資查詢
```

## API 路由對應表

`backend/src/index.ts` 將路由模組掛載於以下路徑：

| 路徑 | 路由模組 |
| --- | --- |
| `/api/auth` | auth.routes.ts |
| `/api/deliveries` | delivery.routes.ts |
| `/api/mileage` | mileage.routes.ts |
| `/api/vehicles` | vehicle.routes.ts |
| `/api/employees` | employee.routes.ts |
| `/api/dispatch` | dispatch.routes.ts |
| `/api/daily-roles` | dailyRole.routes.ts |
| `/api/settings` | settings.routes.ts |
| `/api/salary` | salary.routes.ts |
| `/api/reconciliation` | reconciliation.routes.ts |
| `/api/dashboard` | dashboard.routes.ts |
| `/api/announcement` | announcement.routes.ts |
| `/api/events` | event.routes.ts |
| `/api/leaves` | leave.routes.ts |

## 資料庫主要 Model（`backend/prisma/schema.prisma`）

- **User**：帳號、角色（ADMIN/MANAGER/EMPLOYEE）、特殊職稱、固定加給
- **DeliveryRecord**：每日送件記錄（正/逆物流件數）
- **MileageRecord**：車輛里程記錄（每日結束里程）
- **DailyRoleRecord**：每日司機/隨車人員角色
- **EmployeeTitleOverride**：員工每月職稱手動覆蓋
- **Vehicle / VehicleMaintenanceItem**：車輛與保養項目
- **SalarySettings / SalaryDeduction / MonthlyPricing**：薪資與單價相關設定
- **Announcement / CalendarEvent**：首頁公告與行事曆
- **LeaveRequest**：請假申請與審核
- **ReconciliationRecord**：貨運行 Excel 月結對帳結果

> 已忽略 `node_modules/`、`dist/`、`.git/`、`.claude/` 等建置產出與工具目錄。
