# 薪資公式設定功能規格

## 背景

目前薪資計算邏輯硬寫在 `backend/src/services/salaryService.ts`，職稱判定門檻、每件單價、加給金額等數字無法從後台調整。本功能讓 ADMIN 可在系統設定頁面修改這些數值與計算邏輯參數。

---

## 權限

- **只有 ADMIN** 可查看與修改薪資公式設定
- MANAGER、EMPLOYEE 無法存取此設定頁

---

## 資料庫異動

### 新增 Model：`SalaryFormulaSettings`

```prisma
model SalaryFormulaSettings {
  id        Int      @id @default(1)  // 永遠只有一筆
  config    Json     // 儲存完整公式設定 JSON
  updatedAt DateTime @updatedAt
  updatedBy Int?     // User.id，記錄最後修改者
}
```

`config` JSON 結構（初始預設值需從現有 salaryService.ts 抽出）：

```json
{
  "titleThresholds": {
    "seniorHighDays": 25,
    "seniorHighAvg": 60,
    "seniorLowDays": 25,
    "seniorLowAvg": 30,
    "regularHighDays": 20,
    "regularHighAvg": 60,
    "regularLowDays": 20,
    "regularLowAvg": 30
  },
  "basePricePerItem": {
    "seniorHigh": 12,
    "seniorLow": 10,
    "regularHigh": 10,
    "regularLow": 8,
    "tempHigh": 8,
    "tempLow": 6
  },
  "allowances": {
    "driverAllowance": 200,
    "accompanierAllowance": 100,
    "positionAllowance": 0
  },
  "incentiveBonus": {
    "tier1Days": 25,
    "tier1Avg": 60,
    "tier1Amount": 3000,
    "tier2Days": 25,
    "tier2Avg": 30,
    "tier2Amount": 1500
  },
  "formulaNotes": "職稱判定：出勤天數 >= seniorHighDays 且日均件數 > seniorHighAvg → 資深員工高件數；依此類推。薪資 = 總件數 × 每件單價 + 職務加給 + 司機/隨車加給 + 激勵獎金 - 扣款"
}
```

> `formulaNotes` 欄位讓 ADMIN 可以用文字描述自訂的計算邏輯說明，顯示在設定頁供參考。

---

## API 異動

### 新增路由（掛載於現有 `settings.routes.ts` 或獨立 `salaryFormula.routes.ts`）

| Method | Path | 說明 |
|---|---|---|
| `GET` | `/api/settings/salary-formula` | 取得目前公式設定 |
| `PUT` | `/api/settings/salary-formula` | 更新公式設定（ADMIN only） |

`salaryService.ts` 改為每次計算薪資前先從 DB 讀取 `SalaryFormulaSettings`，取代硬寫的常數。

---

## 前端改動

### 修改：`frontend/src/pages/admin/SettingsPage.tsx`

在現有系統設定頁新增「薪資計算公式」區塊，包含以下分組：

#### 1. 職稱判定門檻
| 欄位 | 說明 |
|---|---|
| 資深員工（高件數）出勤天數門檻 | seniorHighDays |
| 資深員工（高件數）日均件數門檻 | seniorHighAvg |
| 資深員工（低件數）出勤天數門檻 | seniorLowDays |
| 資深員工（低件數）日均件數門檻 | seniorLowAvg |
| 員工（高件數）出勤天數門檻 | regularHighDays |
| 員工（高件數）日均件數門檻 | regularHighAvg |
| 員工（低件數）出勤天數門檻 | regularLowDays |
| 員工（低件數）日均件數門檻 | regularLowAvg |

#### 2. 每件單價（元）
| 欄位 | 說明 |
|---|---|
| 資深員工高件數每件單價 | seniorHigh |
| 資深員工低件數每件單價 | seniorLow |
| 員工高件數每件單價 | regularHigh |
| 員工低件數每件單價 | regularLow |
| 臨時工高件數每件單價 | tempHigh |
| 臨時工低件數每件單價 | tempLow |

#### 3. 加給設定（元/天）
| 欄位 | 說明 |
|---|---|
| 貨車司機加給 | driverAllowance |
| 隨車人員加給 | accompanierAllowance |

#### 4. 激勵獎金條件
| 欄位 | 說明 |
|---|---|
| 第一級：出勤天數 >= | tier1Days |
| 第一級：日均件數 > | tier1Avg |
| 第一級：獎金金額（元） | tier1Amount |
| 第二級：出勤天數 >= | tier2Days |
| 第二級：日均件數 > | tier2Avg |
| 第二級：獎金金額（元） | tier2Amount |

#### 5. 公式說明（自由文字）
- `<textarea>` 讓 ADMIN 填寫計算邏輯說明
- 顯示在薪資計算頁面的說明區塊，方便員工/主管理解計算方式

### UI 互動
- 所有欄位為數字 input，存檔前做基本驗證（不得為負數、不得為空）
- 頁面頂部顯示「上次修改時間：XXXX-XX-XX XX:XX，修改者：XXX」
- 儲存成功後顯示成功提示
- 儲存後薪資計算立即套用新設定（不需重新部署）

---

## 注意事項

1. 現有 `SalarySettings`（加給/扣款設定）model 保留不動，本次只新增 `SalaryFormulaSettings`
2. `salaryService.ts` 改為非同步讀取設定，需確認所有呼叫端都 `await`
3. 初次部署時執行 migration，並自動 seed 一筆預設值（從現有硬寫常數抽出）
4. `formulaNotes` 的內容也顯示在 `SalaryPage.tsx` 的薪資計算說明區塊
