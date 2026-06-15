# 儀表板重構需求規格

## 背景

目前 `frontend/src/pages/admin/DashboardPage.tsx` 將「每日營運總表」、「員工送件狀況」、「車輛狀況」全部塞在同一頁，導致頁面過長、資訊密度過高。

本次重構目標：讓儀表板主頁保持乾淨的今日概覽，三個詳細區塊各自獨立成子頁面，透過入口卡片導航進入。

---

## 改動總覽

| 檔案 | 動作 | 說明 |
|---|---|---|
| `frontend/src/pages/admin/DashboardPage.tsx` | 修改 | 保留今日概覽區塊，移除三個詳細區塊，改為三張入口卡片 |
| `frontend/src/pages/admin/DailyOperationsPage.tsx` | 新增 | 每日營運總表（從 DashboardPage 抽出） |
| `frontend/src/pages/admin/DailyDeliveryStatusPage.tsx` | 新增 | 員工送件狀況（從 DashboardPage 抽出） |
| `frontend/src/pages/admin/VehicleStatusPage.tsx` | 新增 | 車輛狀況（從 DashboardPage 抽出） |
| `frontend/src/App.tsx` | 修改 | 新增三條子路由 |

---

## 路由規劃

```
/dashboard                        → DashboardPage（主頁）
/dashboard/daily-operations       → DailyOperationsPage（每日營運總表）
/dashboard/delivery-status        → DailyDeliveryStatusPage（員工送件狀況）
/dashboard/vehicle-status         → VehicleStatusPage（車輛狀況）
```

App.tsx 中這三條路由需與 `/dashboard` 同樣套用 ADMIN/MANAGER 權限保護（ProtectedRoute）。

---

## DashboardPage.tsx 改動細節

### 保留的區塊（維持原有邏輯不動）
- 年月選擇器
- 月結算統計卡片（本月累計件數、預估薪資總支出、預估總收入、預估毛利）
- 今日件數、今日里程、車輛狀況摘要、待處理事項提醒、快速連結

### 新增的區塊（加在頁面下方）
三張入口卡片，樣式參考如下（使用現有 Tailwind CSS）：

```
[ 圖示 ]  每日營運總表              →
          本月每日收入、件數、出勤人數

[ 圖示 ]  員工送件狀況              →
          查看任一天所有員工送件明細

[ 圖示 ]  車輛狀況                  →  [ 1 逾期 ]（若有保養逾期則顯示徽章）
          里程、保養狀態
```

- 點擊任一卡片使用 `useNavigate` 導航到對應路由
- 車輛狀況卡片：若有保養逾期車輛，顯示橘色警告徽章（逾期數量）
- 卡片樣式建議：`border rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition`

### 移除的區塊
- 原本在 DashboardPage 內的「每日營運總表」完整表格
- 原本在 DashboardPage 內的「員工送件狀況」日期選擇器與表格
- 原本在 DashboardPage 內的「車輛狀況」詳細列表

---

## 三個新子頁面規格

### 共同要求
- 頁面頂部加上返回按鈕：`← 返回儀表板`，點擊後 `navigate('/dashboard')`
- 頁面標題清楚標示（例如「每日營運總表」）
- 將原本 DashboardPage 對應區塊的程式碼（含 state、useEffect、API 呼叫、JSX）完整移過來，不改邏輯

### DailyOperationsPage.tsx
- 內容：原 DashboardPage 的「每日營運總表」區塊
- 包含：年月選擇器（獨立，不依賴主頁的年月狀態）、每日一列的營運數據表格（總正/逆物流、總支付薪資、營業營收、扣除薪水盈餘、平均件數獲利、出勤人數、司機、跟車）、表尾平均與總計列

### DailyDeliveryStatusPage.tsx
- 內容：原 DashboardPage 的「員工送件狀況」區塊
- 包含：獨立日期選擇器、所有在職員工當天送件狀況表格（正/逆物流件數、今日角色、是否已填寫）

### VehicleStatusPage.tsx
- 內容：原 DashboardPage 的「車輛狀況」詳細列表
- 包含：各車輛里程、保養狀態、逾期項目列表

---

## 注意事項

1. **不要改動任何 API 呼叫邏輯與後端**，只移動前端元件與路由
2. **Tailwind CSS 樣式維持與現有頁面一致**，不引入新的 UI 套件
3. **型別定義**沿用 `frontend/src/api/types.ts` 現有型別，不新增
4. **側邊導覽列（AppLayout.tsx）不需修改**，「儀表板」連結維持指向 `/dashboard` 即可
5. 三個子頁面不需出現在側邊欄，只透過儀表板入口卡片進入
