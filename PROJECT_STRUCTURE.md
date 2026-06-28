# 專案結構說明

本文件整理「物流員工管理系統」的目錄與檔案結構，方便快速找到對應功能的程式碼。
專案總覽與功能清單請見 [README.md](README.md)；部署流程請見 [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md)；開發歷程與決策請見 [討論紀錄_2026_06_14.md](討論紀錄_2026_06_14.md)。

## 根目錄總覽

```
.
├── README.md                          專案說明（架構、角色權限、模組清單、啟動方式）
├── DEPLOY_GUIDE.md                    Railway 部署指南
├── PROJECT_STRUCTURE.md               本檔案：目錄與檔案結構說明
├── logistics_system_prompt.md         原始需求規格文件
├── 討論紀錄_2026_06_14.md              開發歷程與功能決策記錄
├── railway.toml                       Railway 後端部署設定（build/migrate/start）
├── logo_透明背景.png                   系統 Logo（透明背景，供前端/PDF使用）
├── 【外包】宇安-配送費(115.05.xlsx      貨運行月結對帳範例 Excel
├── backend/                            後端 API（Express + TypeScript + Prisma）
└── frontend/                           前端網站（React + Vite + TypeScript）
```

## backend/ 後端

```
backend/
├── .env / .env.example                環境變數（DATABASE_URL、JWT_SECRET、PORT）
├── package.json                       依賴與指令（dev/build/prisma:*）
├── tsconfig.json                      TypeScript 設定
├── prisma/
│   ├── schema.prisma                  資料庫 Schema（User、各業務 model、enum）
│   ├── migrations/                    資料庫遷移紀錄（依時間排序）
│   │   ├── 20260613000000_init                                        初始 schema
│   │   ├── 20260613100000_add_registration_toggle_and_salary_deduction  註冊開關＋薪資扣款
│   │   ├── 20260613110000_add_manager_role                             新增 MANAGER 角色
│   │   ├── 20260613120000_vehicle_type_and_maintenance                 車輛類型＋保養項目
│   │   ├── 20260613130000_supervisor_daily_role_and_allowance          主管權限＋每日角色加給
│   │   ├── 20260613140000_announcement_calendar_leave                  公告／行事曆／請假
│   │   ├── 20260613150000_rename_daily_role_type_values                每日角色 enum 改名
│   │   ├── 20260614000000_reconciliation_forward_reverse_breakdown     對帳正逆物流拆分
│   │   ├── 20260614010000_mileage_end_only                             里程改為僅記結束里程
│   │   ├── 20260615000000_add_region_manager_role                      新增 REGION_MANAGER 角色
│   │   ├── 20260615010000_region_and_salary_formula                    區域管理＋薪資公式設定
│   │   ├── 20260616000000_add_schedule                                 排班系統
│   │   ├── 20260616010000_add_fuel_report                              加油回報系統
│   │   ├── 20260616020000_fuel_report_add_vehicle                      加油回報關聯機車車牌
│   │   └── 20260625000000_add_parking_fee_report                      停車費回報系統
│   └── migration_lock.toml
└── src/
    ├── index.ts                       Express 入口，註冊所有路由與中介層
    ├── assets/                        PDF 用素材（Logo、思源黑體字型）
    ├── lib/
    │   └── prisma.ts                  Prisma Client 單例
    ├── middleware/
    │   ├── auth.ts                    JWT 驗證、角色權限檢查（含 getManagedUserIds）
    │   └── errorHandler.ts            統一錯誤處理
    ├── utils/
    │   ├── asyncHandler.ts            包裝 async route handler 例外捕捉
    │   └── date.ts                    日期處理工具（parseDateOnly、startOfMonth 等）
    ├── routes/                        API 路由（對應 /api/* ）
    │   ├── auth.routes.ts             登入／註冊／JWT 發行
    │   ├── delivery.routes.ts         每日送件記錄（正/逆物流件數）
    │   ├── mileage.routes.ts          車輛里程記錄
    │   ├── dailyRole.routes.ts        今日角色（司機/隨車人員）
    │   ├── vehicle.routes.ts          車輛管理與保養提醒
    │   ├── dispatch.routes.ts         派遣紀錄（依角色＋里程即時統計）
    │   ├── leave.routes.ts            請假申請與審核
    │   ├── salary.routes.ts           薪資計算、薪資單 PDF／總表 Excel 匯出
    │   ├── reconciliation.routes.ts   貨運行 Excel 月結對帳
    │   ├── employee.routes.ts         員工帳號與歷史紀錄管理
    │   ├── region.routes.ts           區域管理（區域/成員/區域經理/我的區域）
    │   ├── settings.routes.ts         後台基礎設定（加給/單價/註冊開關/薪資公式）
    │   ├── dashboard.routes.ts        管理者儀表板統計（含 /delivery-export 當月送件狀況 Excel 匯出）
    │   ├── announcement.routes.ts     首頁公告
    │   ├── event.routes.ts            行事曆活動
    │   ├── schedule.routes.ts         排班系統（含 /calendar 所有人可讀端點）
    │   ├── fuelReport.routes.ts       加油回報（提交/審核/刪除）
    │   └── parkingFeeReport.routes.ts 停車費回報（提交/審核/刪除）
    └── services/                      業務邏輯層
        ├── mileageService.ts          依前一筆紀錄推算當日行駛里程
        ├── pricingService.ts          月度正/逆物流單價與稅後金額計算
        ├── salaryService.ts           職稱判定、加給、激勵獎金、油資補貼、停車費補貼、扣款等薪資邏輯
        ├── salaryService.test.ts      薪資計算邏輯的 Vitest 單元測試（邊界值＋整合計算）
        ├── salaryPdfService.tsx       薪資單 PDF 產生（@react-pdf/renderer）
        ├── reconciliationService.ts   解析貨運行 Excel、計算對帳差異
        └── vehicleService.ts          車輛保養項目與維修登記邏輯
```

> 後端測試以 Vitest 撰寫，執行 `cd backend && npm test`。測試檔（`*.test.ts`）已於 `tsconfig.json` 排除，不會編入 `dist/`。

## frontend/ 前端

```
frontend/
├── index.html                         HTML 進入點
├── package.json                       依賴與指令（dev/build/lint）
├── vite.config.ts                     Vite 設定（含 /api proxy）
├── eslint.config.js                   ESLint 設定
├── tsconfig*.json                     TypeScript 設定
├── railway.toml                       Railway 前端部署設定（serve dist）
├── public/                            靜態資源（favicon、logo）
└── src/
    ├── main.tsx                       React 進入點
    ├── App.tsx                        路由設定（依角色導向不同頁面）
    ├── index.css                      Tailwind 全域樣式
    ├── api/
    │   ├── client.ts                  axios 實例（attach JWT、baseURL）
    │   └── types.ts                   API 請求/回應型別定義
    ├── auth/
    │   ├── AuthContext.tsx            登入狀態與使用者資訊 Context
    │   └── ProtectedRoute.tsx         路由保護（依角色限制存取）
    ├── components/
    │   └── ErrorBoundary.tsx          全域錯誤邊界
    ├── layouts/
    │   └── AppLayout.tsx              主版面與側邊導覽列（依角色/部門分類：核心作業／物流與派遣／回報與審核／人事行政／薪資／系統設定）
    └── pages/
        ├── HomePage.tsx               首頁（公告欄＋行事曆＋排班整合＋我的排班快速欄）
        ├── LoginPage.tsx              登入頁
        ├── RegisterPage.tsx           註冊頁
        ├── admin/                     ADMIN / MANAGER / REGION_MANAGER 管理頁面
        │   ├── DashboardPage.tsx      管理者儀表板總覽（月結統計、待處理事項、子頁面入口）
        │   ├── DailyOperationsPage.tsx  每日營運總表（儀表板子頁面，含「匯出當月送件狀況」Excel）
        │   ├── DailyDeliveryStatusPage.tsx  員工送件狀況（儀表板子頁面）
        │   ├── VehicleStatusPage.tsx  車輛狀況（儀表板子頁面）
        │   ├── DispatchPage.tsx       派遣紀錄（今日角色校正、里程編輯）
        │   ├── EmployeeRecordsPage.tsx  員工歷史紀錄管理（僅 ADMIN）
        │   ├── EmployeesPage.tsx      員工帳號與角色管理
        │   ├── FuelReviewPage.tsx     油資審核（待審核 / 歷史紀錄 / 車輛油費 三 tab）
        │   ├── LeaveManagementPage.tsx  請假審核
        │   ├── ParkingFeeReviewPage.tsx 停車費審核（待審核 / 歷史紀錄 / 車輛停車費 三 tab）
        │   ├── ReconciliationPage.tsx 貨運行 Excel 對帳
        │   ├── RegionManagementPage.tsx 區域管理（建立區域、指派成員與區域經理）
        │   ├── SalaryPage.tsx         薪資計算與匯出
        │   ├── SchedulePage.tsx       排班管理（月曆/列表視圖、單人/批次新增）
        │   ├── SettingsPage.tsx       後台基礎設定＋薪資計算公式設定（僅 ADMIN）
        │   ├── VehicleStatusPage.tsx  車輛狀況（儀表板子頁面）
        │   └── VehiclesPage.tsx       車輛管理與保養
        └── employee/                  EMPLOYEE 頁面
            ├── DailyDeliveryPage.tsx  每日送件記錄填寫
            ├── FuelReportPage.tsx     加油回報提交與歷史查詢
            ├── LeaveRequestPage.tsx   請假申請
            ├── MileagePage.tsx        車輛里程記錄填寫
            ├── MyRegionPage.tsx       我的區域（REGION_MANAGER：送件/成員/請假/派遣）
            ├── MySalaryPage.tsx       我的薪資查詢（含油資/停車費補貼明細）
            ├── MySchedulePage.tsx     我的排班（月曆視圖、當月統計）
            └── ParkingFeeReportPage.tsx 停車費回報提交與歷史查詢
```

## API 路由對應表

`backend/src/index.ts` 將路由模組掛載於以下路徑：

| 路徑 | 路由模組 | 說明 |
| --- | --- | --- |
| `/api/auth` | auth.routes.ts | 登入／註冊 |
| `/api/deliveries` | delivery.routes.ts | 每日送件記錄 |
| `/api/mileage` | mileage.routes.ts | 車輛里程記錄 |
| `/api/vehicles` | vehicle.routes.ts | 車輛管理與保養 |
| `/api/employees` | employee.routes.ts | 員工帳號與歷史紀錄 |
| `/api/regions` | region.routes.ts | 區域管理 |
| `/api/dispatch` | dispatch.routes.ts | 派遣紀錄 |
| `/api/daily-roles` | dailyRole.routes.ts | 今日角色 |
| `/api/settings` | settings.routes.ts | 後台設定 |
| `/api/salary` | salary.routes.ts | 薪資計算與匯出 |
| `/api/reconciliation` | reconciliation.routes.ts | 貨運行對帳 |
| `/api/dashboard` | dashboard.routes.ts | 儀表板統計 |
| `/api/announcement` | announcement.routes.ts | 首頁公告 |
| `/api/events` | event.routes.ts | 行事曆活動 |
| `/api/leaves` | leave.routes.ts | 請假申請與審核 |
| `/api/schedules` | schedule.routes.ts | 排班系統（含 `/calendar` 公開端點） |
| `/api/fuel-reports` | fuelReport.routes.ts | 加油回報與審核 |
| `/api/parking-fee-reports` | parkingFeeReport.routes.ts | 停車費回報與審核 |

## 資料庫主要 Model（`backend/prisma/schema.prisma`）

- **User**：帳號、角色（ADMIN/MANAGER/REGION_MANAGER/EMPLOYEE）、特殊職稱、固定加給
- **DeliveryRecord**：每日送件記錄（正/逆物流件數）
- **MileageRecord**：車輛里程記錄（每日結束里程）
- **DailyRoleRecord**：每日司機/隨車人員角色
- **EmployeeTitleOverride**：員工每月職稱手動覆蓋
- **Vehicle / VehicleMaintenanceItem**：車輛與保養項目
- **Region / RegionMember**：區域與區域成員（含區域經理標記，一人可屬於多區域）
- **SalarySettings / SalaryDeduction / MonthlyPricing**：薪資與單價相關設定
- **SalaryFormulaSettings**：薪資計算公式設定（職稱判定門檻、每件單價、加給、激勵獎金，JSON）
- **Announcement / CalendarEvent**：首頁公告與行事曆
- **LeaveRequest**：請假申請與審核
- **ReconciliationRecord**：貨運行 Excel 月結對帳結果
- **Schedule**：排班紀錄（日期、小區域、員工、區域、建立者）
- **FuelReport**：加油回報（日期、金額、關聯車輛機車或貨車、員工、審核狀態、審核者）
- **ParkingFeeReport**：停車費回報（日期、金額、關聯車輛機車或貨車、員工、審核狀態、審核者）

> 已忽略 `node_modules/`、`dist/`、`.git/`、`.claude/` 等建置產出與工具目錄。
