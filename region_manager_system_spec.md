# 區域主管系統規格

## 背景與階層設計

本系統採固定 4 階層，資料庫設計預留擴充為動態角色權限系統（方向B）的空間。

```
ADMIN（董事長）      → 完整系統權限
MANAGER（CEO）       → 全公司管理權限（現有角色，不變）
REGION_MANAGER（區域經理） → 新角色，只能看管自己負責區域的成員
EMPLOYEE（員工）     → 只能看自己的資料（現有角色，不變）
```

---

## 資料庫異動

### 新增 Model：`Region`（區域）

```prisma
model Region {
  id          Int      @id @default(autoincrement())
  name        String   // 區域名稱，例如「北區」、「南區」
  description String?  // 備註說明
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members     RegionMember[]  // 區域成員（含主管與員工）
}
```

### 新增 Model：`RegionMember`（區域成員）

```prisma
model RegionMember {
  id       Int    @id @default(autoincrement())
  regionId Int
  userId   Int
  isManager Boolean @default(false)  // true = 此人是該區域的主管

  region   Region @relation(fields: [regionId], references: [id])
  user     User   @relation(fields: [userId], references: [id])

  @@unique([regionId, userId])  // 同一區域同一人只能出現一次
}
```

### 修改 Model：`User`（擴充角色）

```prisma
enum Role {
  ADMIN
  MANAGER
  REGION_MANAGER   // 新增
  EMPLOYEE
}
```

> **為方向B留活口**：`RegionMember.isManager` 與 `Region` model 本身已是彈性結構，未來若要做動態權限，可在 `Region` 加 `permissionConfig Json?` 欄位，不需重寫整個架構。

---

## 權限矩陣

| 功能 | ADMIN | MANAGER | REGION_MANAGER | EMPLOYEE |
|---|---|---|---|---|
| 建立/編輯/刪除區域 | ✅ | ✅ | ❌ | ❌ |
| 指派區域主管與成員 | ✅ | ✅ | ❌ | ❌ |
| 查看自己區域成員資料 | ✅ | ✅ | ✅（僅自己區域） | ❌ |
| 審核自己區域成員請假 | ✅ | ✅ | ✅（僅自己區域） | ❌ |
| 校正自己區域成員今日角色 | ✅ | ✅ | ✅（僅自己區域） | ❌ |
| 查看自己區域成員薪資 | ✅ | ✅ | ✅（僅自己區域） | ❌ |
| 編輯/刪除送件、里程紀錄 | ✅ | ❌ | ❌ | ❌ |
| 薪資公式設定 | ✅ | ❌ | ❌ | ❌ |
| 員工帳號管理 | ✅ | ❌ | ❌ | ❌ |

---

## API 異動

### 新增路由：`region.routes.ts`，掛載於 `/api/regions`

| Method | Path | 權限 | 說明 |
|---|---|---|---|
| `GET` | `/api/regions` | ADMIN, MANAGER | 取得所有區域清單 |
| `POST` | `/api/regions` | ADMIN, MANAGER | 建立新區域 |
| `PUT` | `/api/regions/:id` | ADMIN, MANAGER | 編輯區域名稱/說明 |
| `DELETE` | `/api/regions/:id` | ADMIN, MANAGER | 停用區域（軟刪除） |
| `GET` | `/api/regions/:id/members` | ADMIN, MANAGER, REGION_MANAGER | 取得區域成員清單 |
| `POST` | `/api/regions/:id/members` | ADMIN, MANAGER | 新增成員到區域 |
| `DELETE` | `/api/regions/:id/members/:userId` | ADMIN, MANAGER | 從區域移除成員 |
| `PATCH` | `/api/regions/:id/members/:userId/manager` | ADMIN, MANAGER | 設定/取消該成員為區域主管 |
| `GET` | `/api/regions/my` | REGION_MANAGER | 取得自己負責的區域與成員 |

### 現有 API 異動

以下 API 需新增 REGION_MANAGER 的資料過濾邏輯：

- `GET /api/deliveries` — REGION_MANAGER 只能查詢自己區域成員的紀錄
- `GET /api/salary` — REGION_MANAGER 只能查詢自己區域成員的薪資
- `GET /api/leaves` — REGION_MANAGER 只能看到自己區域成員的請假，且只能審核這些請假
- `GET /api/dispatch` — REGION_MANAGER 只能看自己區域成員的派遣紀錄
- `PATCH /api/daily-roles` — REGION_MANAGER 只能校正自己區域成員的今日角色

---

## 前端異動

### 1. 新增頁面：`RegionManagementPage.tsx`（ADMIN / MANAGER）

路由：`/regions`，側邊欄「系統設定」區塊新增「區域管理」入口。

功能：
- 區域列表（名稱、成員數、主管姓名、狀態）
- 新增/編輯/停用區域
- 點進區域後顯示成員列表，可新增成員、設定/取消區域主管、移除成員
- 成員選擇器：從現有在職員工中選擇（支援搜尋姓名）

### 2. 新增頁面：`MyRegionPage.tsx`（REGION_MANAGER）

路由：`/my-region`，側邊欄「核心作業」區顯示「我的區域」入口（僅 REGION_MANAGER 可見）。

頁面結構：

```
我的區域
├── 頂部：區域名稱、成員總數、今日出勤人數
├── Tab 一：今日送件狀況
│   └── 所有成員今日正/逆物流件數、今日角色、是否已填寫
├── Tab 二：成員列表
│   └── 姓名、職稱、本月累計件數、預估薪資（點擊可展開明細）
├── Tab 三：請假管理
│   └── 待審核請假列表，可核准/拒絕
└── Tab 四：派遣紀錄
    └── 今日誰開哪輛車、司機/隨車，可校正今日角色
```

若該 REGION_MANAGER 管轄多個區域，頁面頂部加區域切換下拉選單。

### 3. 修改：`EmployeesPage.tsx`

- 員工列表新增「所屬區域」欄位顯示
- ADMIN/MANAGER 可直接在員工詳情中查看該員工屬於哪些區域

### 4. 修改：`AppLayout.tsx`（側邊導覽列）

- REGION_MANAGER 的側邊欄顯示簡化版：
  - 核心作業：我的區域、每日送件記錄、車輛里程記錄
  - 人事行政：請假申請
- REGION_MANAGER 不顯示全公司儀表板、薪資總表、貨運行對帳等全域功能

### 5. 修改：`App.tsx`

新增路由：
```
/regions                → RegionManagementPage（ADMIN/MANAGER）
/my-region              → MyRegionPage（REGION_MANAGER）
```

---

## 員工管理頁（EmployeesPage）角色設定異動

ADMIN 在建立/編輯員工帳號時，角色選項新增 `REGION_MANAGER`，顯示名稱為「區域經理」。

---

## 注意事項

1. **現有 MANAGER 行為完全不變**，本次只新增 REGION_MANAGER，不改動 MANAGER 邏輯
2. **一個員工可同時屬於多個區域**（`RegionMember` 允許同一 userId 出現在不同 regionId）
3. **一個區域可以有多個主管**（`isManager: true` 可以多人）
4. REGION_MANAGER 自己也可以填寫每日送件記錄、里程記錄，與 EMPLOYEE 相同
5. 軟刪除區域時（`isActive: false`），不刪除 `RegionMember` 紀錄，方便日後恢復
6. 為方向B預留：`RegionMember` 可在未來加上 `customPermissions Json?` 欄位，讓特定成員有額外權限覆蓋，不需重建整個 schema
