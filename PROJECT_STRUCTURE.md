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
│   │   ├── 20260625000000_add_parking_fee_report                      停車費回報系統
│   │   ├── 20260629000000_vehicle_maintenance_upgrade                 維修履歷/證件到期/時間週期/故障報修
│   │   ├── 20260630000000_salary_snapshot_lock                        薪資月份封存（鎖+快照）/封存提醒寬限日
│   │   ├── 20260630010000_job_position                                職務（固定加給＋模組權限 capabilities）
│   │   ├── 20260701000000_job_position_since                          職務加給任職起始日
│   │   └── 20260703000000_maintenance_log_category                    維修履歷花費分類（保養／保險／其他）
│   └── migration_lock.toml
└── src/
    ├── index.ts                       Express 入口，註冊所有路由與中介層
    ├── assets/                        PDF 用素材（Logo、思源黑體字型）
    ├── lib/
    │   └── prisma.ts                  Prisma Client 單例
    ├── middleware/
    │   ├── auth.ts                    JWT 驗證、角色權限檢查（含 getManagedUserIds、職務權限 requireCapability/capabilities 解析）
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
    │   ├── asset.routes.ts            資產列管（資產卡、零利率分期、本月應繳帶入記帳、結清、處分）
    │   ├── dispatch.routes.ts         派遣紀錄（依角色＋里程即時統計）
    │   ├── leave.routes.ts            請假申請與審核
    │   ├── salary.routes.ts           薪資計算、薪資單 PDF／總表 Excel 匯出
    │   ├── employee.routes.ts         員工帳號與歷史紀錄管理
    │   ├── settings.routes.ts         後台基礎設定（加給/單價/註冊開關/薪資公式）
    │   ├── dashboard.routes.ts        營運總覽統計（含 /delivery-export 當月送件狀況 Excel 匯出）
    │   ├── announcement.routes.ts     首頁公告
    │   ├── event.routes.ts            行事曆活動
    │   ├── expenseReport.routes.ts    加油回報與停車費回報共用路由（提交/代填/審核/刪除，依 kind 區分資料表）
    │   ├── review.routes.ts           審核中心待處理件數
    │   ├── home.routes.ts             首頁「我的待辦」（依身分彙整待辦，含薪資加給差一點就到的提醒）
    │   ├── dailyEntry.routes.ts       今日收工：一次讀取／送出當天角色、送件、里程與加油回報（單一交易）
    │   ├── checks.routes.ts           資料檢查（異常偵測）清單與「沒問題」標記（ADMIN/MANAGER）
    │   ├── reports.routes.ts          週報（ADMIN/MANAGER）
    │   ├── closing.routes.ts          月底結算清單（ADMIN）
    │   ├── auditLog.routes.ts         操作紀錄查詢（ADMIN）
    │   ├── repairRequest.routes.ts    車輛故障報修（員工提交、ADMIN/MANAGER 或具車輛權限者處理、完成寫入維修履歷）
    │   ├── jobPosition.routes.ts      職務 CRUD（固定加給＋模組權限 capabilities，僅 ADMIN 可增刪改）
    │   └── finance.routes.ts          記帳模組（帳目 CRUD／關係人／分類／帶入中心／月報／Excel・PDF 匯出，僅 ADMIN）
    └── services/                      業務邏輯層
        ├── mileageService.ts          依前一筆紀錄推算當日行駛里程
        ├── proxyEntryService.ts       代填共用：可代填對象範圍（送件、加油、停車費）與權限檢查
        ├── assetService.ts            資產列管純函式：直線法折舊、零利率分期（尾數、已繳期數、本月應繳）、處分損益
        ├── assetService.test.ts       資產計算 Vitest 單元測試
        ├── vehicleService.ts          車輛狀態彙整：保養雙週期（里程+天數）提醒、證件到期判定、待處理報修數、預設保養項目
        ├── salaryService.ts           每件單價（出勤/日均/總件數疊加加給）、加給、激勵獎金、油資補貼、停車費補貼、扣款等薪資邏輯；批次計算整批查詢；月份封存/解封與快照讀取
        ├── salaryService.test.ts      薪資計算邏輯的 Vitest 單元測試（邊界值＋整合計算）
        ├── salaryGoalService.ts       薪資「差一點就到」：挑最接近的加給門檻（首頁提醒用）與本月剩餘可出勤天數
        ├── salaryGoalService.test.ts  薪資進度欄位與提醒挑選的 Vitest 單元測試
        ├── anomalyService.ts          資料檢查：件數離群、里程倒退／每天開太多、每公里油錢暴增、重複報帳（純函式＋即時撈資料）
        ├── anomalyService.test.ts     資料檢查規則的 Vitest 單元測試
        ├── weeklyReportService.ts     週報：一週件數、預估營收、花費、每人件數與前一週比較
        ├── closingService.ts          月底結算清單：七個步驟的即時檢查與連結
        ├── auditService.ts            操作紀錄：audit() 寫入、diff() 比對改前改後、欄位中文名稱
        ├── salaryPdfService.tsx       薪資單 PDF 產生（@react-pdf/renderer）
        ├── financeService.ts          記帳模組核心：預設關係人/分類初始化、損益/分類彙總/股東結算純函式、薪資帶入金額（方案A）
        ├── financeService.test.ts     記帳計算邏輯 Vitest 單元測試（含撥款成對合併）
        ├── financeReportService.ts    月報／年度總覽資料組裝（API、Excel、PDF 共用）
        ├── financeImportService.ts    帶入中心：四來源狀態查詢、帶入執行、防重複、來源變動警告
        └── financePdfService.tsx      帳務月報 PDF（格式對齊舊單機系統月報表，含圓餅圖）
```

> `backend/scripts/importFinanceDb.ts`：舊單機記帳系統 finance.db 一次性匯入（撥款成對合併、分類自動補建、防重複執行）；`scripts/verifyJuneReport.ts` 為匯入後報表核對工具；`scripts/e2eFinanceTest.ts` 為記帳模組端對端實測腳本；`scripts/e2eProxyExpenseTest.ts` 為代填加油／停車費回報端對端實測（39 項）；`scripts/e2eDailyCloseTest.ts` 為今日收工與薪資進度端對端實測（25 項）；`scripts/e2eDataChecksTest.ts` 為資料檢查與週報端對端實測（25 項）；`scripts/e2eAuditClosingTest.ts` 為操作紀錄、月底結算與車貸「已另外記帳」端對端實測（33 項）。

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
│   ├── manifest.webmanifest           加到主畫面（PWA）設定：名稱、圖示、獨立視窗
│   ├── sw.js                          Service Worker（只快取 /assets/ 與離線頁面殼，API 不快取）
│   └── icons/                         App 圖示（192、512、maskable、apple-touch-icon）
└── src/
    ├── main.tsx                       React 進入點（註冊 Service Worker、攔截安裝事件）
    ├── App.tsx                        路由設定（依角色導向不同頁面）
    ├── index.css                      Tailwind 全域樣式
    ├── api/
    │   ├── client.ts                  axios 實例（attach JWT、baseURL）
    │   └── types.ts                   API 請求/回應型別定義
    ├── auth/
    │   ├── AuthContext.tsx            登入狀態與使用者資訊 Context
    │   └── ProtectedRoute.tsx         路由保護（依角色限制存取）
    ├── components/
    │   ├── ErrorBoundary.tsx          全域錯誤邊界
    │   ├── TabbedPage.tsx             整合頁共用外框（標題＋分頁列，目前分頁記在網址 ?tab=）
    │   ├── expense/                   加油／停車費共用：回報面板、審核面板（依 kind 切換 API 與文字）
    │   ├── requests/                  請假、報修面板（申請／審核）與審核中心「全部待處理」
    │   ├── assets/                    資產頁元件（清單、明細、新增／編輯表單、本月應繳）
    │   ├── operations/                營運總覽各分頁（總覽、週報、每日營運、送件與派車、車輛狀況、資料檢查、月底結算）
    │   ├── settings/AuditLogPanel.tsx 系統設定「操作紀錄」（篩選、改前改後、載入更多）
    │   ├── daily/DailyClosePanel.tsx  每日填報「今日收工」（角色＋件數＋里程＋加油一次送出）
    │   ├── salary/SalaryGoals.tsx     我的薪資「下一階加給還差多少」
    │   ├── InstallAppCard.tsx         首頁「加到主畫面」提示（依手機與瀏覽器顯示不同教學）
    │   ├── WeeklyHomeCard.tsx         首頁「上週週報」摘要（董事長、執行長）
    │   └── TodoCard.tsx               首頁「我的待辦」
    ├── layouts/
    │   └── AppLayout.tsx              主版面與側邊導覽列（每天／主管／管理／記帳／系統，審核中心顯示待處理件數）＋手機底部四顆按鈕
    ├── utils/installPrompt.ts         加到主畫面：攔截 beforeinstallprompt、判斷 iPhone／App 內建瀏覽器
    └── pages/
        ├── HomePage.tsx               首頁（公告欄＋我的待辦＋行事曆）
        ├── LoginPage.tsx              登入頁
        ├── RegisterPage.tsx           註冊頁
        ├── hubs/                      整合頁（以分頁組合下列頁面）
        │   ├── DailyEntryPage.tsx     每日填報（今日收工／送件紀錄／里程紀錄）
        │   ├── StaffPage.tsx          員工（員工資料／職務與加給／績效統計）
        │   ├── SalaryHubPage.tsx      薪資（薪資計算／員工薪資畫面／職等設定）
        │   └── SystemSettingsPage.tsx 系統設定（一般／帳務設定／操作紀錄）
        ├── admin/                     ADMIN / MANAGER 管理頁面
        │   ├── OperationsPage.tsx     營運總覽（總覽／週報／每日營運／送件與派車／車輛狀況／資料檢查／月底結算）
        │   ├── EmployeeRecordsPage.tsx  員工歷史紀錄管理（僅 ADMIN）
        │   ├── EmployeesPage.tsx      員工管理（員工資料／職務加給設定／權限設定 三分頁）
        │   ├── SalaryPage.tsx         薪資計算與匯出
        │   ├── SettingsPage.tsx       後台基礎設定＋薪資計算公式設定（僅 ADMIN）
        │   ├── VehiclesPage.tsx       車輛管理與保養
        │   ├── AssetsPage.tsx         資產（資產清單／本月應繳）
        │   ├── FinanceRecordsPage.tsx 記帳（快速輸入＋當月明細篩選/編輯/刪除，僅 ADMIN）
        │   ├── FinanceReportPage.tsx  帳務月報（損益/分類圓餅/明細/股東結算＋累計/年度總覽/匯出）
        │   ├── FinanceImportPage.tsx  帶入中心（油資/停車費/維修/薪資四來源，預覽＋防重複＋來源警告）
        │   ├── FinanceSettingsPage.tsx 帳務設定（關係人/收支分類/帶入預設關係人）
        │   └── ReviewCenterPage.tsx   審核中心（全部待處理／油資／停車費／請假／報修）
        └── employee/                  EMPLOYEE 頁面
            ├── DailyDeliveryPage.tsx  每日送件記錄填寫
            ├── MileagePage.tsx        車輛里程記錄填寫
            ├── MySalaryPage.tsx       我的薪資查詢（含油資/停車費補貼明細）
            ├── MyRequestsPage.tsx     我的申請（加油／停車費／車輛報修／請假）
```

## API 路由對應表

`backend/src/index.ts` 將路由模組掛載於以下路徑：

| 路徑 | 路由模組 | 說明 |
| --- | --- | --- |
| `/api/auth` | auth.routes.ts | 登入／註冊 |
| `/api/deliveries` | delivery.routes.ts | 每日送件記錄 |
| `/api/mileage` | mileage.routes.ts | 車輛里程記錄 |
| `/api/vehicles` | vehicle.routes.ts | 車輛管理與保養 |
| `/api/assets` | asset.routes.ts | 資產列管 |
| `/api/employees` | employee.routes.ts | 員工帳號與歷史紀錄 |
| `/api/dispatch` | dispatch.routes.ts | 派遣紀錄 |
| `/api/daily-roles` | dailyRole.routes.ts | 今日角色 |
| `/api/settings` | settings.routes.ts | 後台設定 |
| `/api/salary` | salary.routes.ts | 薪資計算與匯出 |
| `/api/dashboard` | dashboard.routes.ts | 營運總覽統計 |
| `/api/announcement` | announcement.routes.ts | 首頁公告 |
| `/api/events` | event.routes.ts | 行事曆活動 |
| `/api/leaves` | leave.routes.ts | 請假申請與審核 |
| `/api/fuel-reports` | expenseReport.routes.ts（kind=fuel） | 加油回報與審核 |
| `/api/parking-fee-reports` | expenseReport.routes.ts（kind=parking） | 停車費回報與審核 |
| `/api/review` | review.routes.ts | 審核中心待處理件數 |
| `/api/home` | home.routes.ts | 首頁我的待辦 |
| `/api/daily-entry` | dailyEntry.routes.ts | 今日收工（角色＋送件＋里程＋加油一次送出） |
| `/api/checks` | checks.routes.ts | 資料檢查（異常偵測）與「沒問題」標記 |
| `/api/reports` | reports.routes.ts | 週報 |
| `/api/closing` | closing.routes.ts | 月底結算清單 |
| `/api/audit-logs` | auditLog.routes.ts | 操作紀錄查詢 |
| `/api/repair-requests` | repairRequest.routes.ts | 車輛故障報修（提交/處理/完成寫入履歷） |
| `/api/job-positions` | jobPosition.routes.ts | 職務 CRUD（固定加給＋模組權限） |
| `/api/finance` | finance.routes.ts | 記帳模組（帳目/關係人/分類/月報/帶入中心/匯出，僅 ADMIN） |

## 資料庫主要 Model（`backend/prisma/schema.prisma`）

- **User**：帳號、角色（ADMIN/MANAGER/EMPLOYEE）、職務指派（`jobPositionId`，決定固定加給與模組權限）
- **DeliveryRecord**：每日送件記錄（正/逆物流件數）
- **MileageRecord**：車輛里程記錄（每日結束里程）
- **DailyRoleRecord**：每日司機/隨車人員角色
- **Vehicle**：車輛（含累計里程與強制險／第三人責任險／驗車／牌照稅／燃料稅到期日）
- **Asset**：資產卡（取得成本、耐用年數、殘值、可對應 Vehicle；零利率分期欄位；提前結清與處分）。計算見 `services/assetService.ts`
- **VehicleMaintenanceItem**：保養項目（里程週期 `intervalKm` ＋選填時間週期 `intervalDays`，先到先提醒）
- **MaintenanceLog**：維修保養履歷（日期、里程、項目、費用、花費分類 `category`（保養／保險／其他）、廠商／技師、備註、登記人；永久保留）。車輛「花費總覽」以此分類彙整並併入已核准加油回報統計每台個別花費，可依全部時期／年／月檢視並匯出 Excel（單車明細 `/vehicles/:id/expenses/export`、全車隊總表 `/vehicles/expenses/export`）
- **RepairRequest**：車輛故障報修（描述、狀態 PENDING/IN_PROGRESS/DONE/CANCELLED、回報人、處理人）
- **Region / RegionMember**：區域與區域成員（區域管理功能已移除，資料表暫予保留僅存歷史資料）
- **SalarySettings / SalaryDeduction / MonthlyPricing**：薪資與單價相關設定（SalarySettings 含 `salaryLockGraceDay` 封存提醒寬限日與註冊開關；MonthlyPricing 存每月正／逆物流實拿單價 `forwardPrice`／`reversePrice`；司機／隨車日加給在 PayGrade.config.roleBonus）
- **SalaryFormulaSettings**：薪資計算公式設定（每件單價與其出勤/日均/總件數加給門檻、激勵獎金，JSON）
- **SalaryMonthLock / SalarySnapshot**：薪資月份封存鎖與快照（封存後該年月薪資凍結為 SalarySnapshot，讀取改以快照為準）
- **JobPosition**：職務（固定月加給 `allowance` ＋模組權限 `capabilities`），`User.jobPositionId` 單選指派（已由 `UserJobPosition` 多選取代）。capabilities 鍵：`MANAGE_VEHICLES`、`MANAGE_FINANCE`（記帳，所記帳目需 ADMIN 審核）、`PROXY_DELIVERY`（代填送件，只限代管帳號）
- **Announcement / CalendarEvent**：首頁公告與行事曆
- **LeaveRequest**：請假申請與審核
- **ReconciliationRecord**：貨運行 Excel 月結對帳結果
- **Schedule**：排班紀錄（功能已於 v1.34 移除，資料表保留歷史資料）
- **FuelReport**：加油回報（日期、金額、關聯車輛機車或貨車、員工、代填者 `enteredById`、審核狀態、審核者）
- **ParkingFeeReport**：停車費回報（日期、金額、關聯車輛機車或貨車、員工、代填者 `enteredById`、審核狀態、審核者）
- **FinanceParty**：記帳關係人（股東＋公款；`isShareholder` 決定是否參與股東結算，可停用）
- **FinanceCategory**：收入／支出分類（`@@unique([kind, name])`，可自訂增刪、停用）
- **FinanceRecord**：帳目（日期、類型 INCOME/EXPENSE/TRANSFER、關係人、TRANSFER 的轉入方 `counterPartyId`、分類、金額一律正數、備註、來源類型 `sourceType`、建立者、審核狀態 `status` PENDING/APPROVED/REJECTED＋審核者/駁回原因）；內部撥款為單筆雙方記錄；報表只計 APPROVED；ADMIN 記帳直接 APPROVED，MANAGE_FINANCE 職務記帳為 PENDING 需 ADMIN 核准
- **FinanceSourceLink**：帳目與來源紀錄連結（`@@unique([sourceType, sourceId])` 防重複帶入；`amountAtLink` 供偵測來源變動；刪帳目 cascade 釋放）
- **FinanceSettings**：帶入中心四種來源的預設關係人（singleton id=1）
- **AnomalyDismissal**：資料檢查被標記「沒問題」的異常（`key` 含當下數字，資料改過會重新檢查）
- **AuditLog**：操作紀錄（操作者與當時姓名、分類、動作、摘要、對象員工、改前改後 `changes`；對象不設外鍵，帳號刪除後紀錄仍在）

> 已忽略 `node_modules/`、`dist/`、`.git/`、`.claude/` 等建置產出與工具目錄。
