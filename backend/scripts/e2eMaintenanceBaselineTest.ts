// 保養項目基準同步 Bug 驗證（本機 dev 環境）：
// 登記保養 → 編輯履歷里程 → 確認保養項目「上次更換里程」同步更新
// 用法：npx tsx scripts/e2eMaintenanceBaselineTest.ts（需先啟動 backend dev server）
// 結束時會清除造出的測試車輛。

const BASE = "http://localhost:4000/api";
let TOKEN = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

interface ItemStatus { id: string; itemName: string; lastChangeMileage: number; lastChangeAt: string | null; remaining: number }
interface Status { id: string; plateNumber: string; currentMileage: number; maintenanceItems: ItemStatus[] }

async function getStatus(vehicleId: string): Promise<Status> {
  const list = (await api("GET", "/vehicles")).json as Status[];
  return list.find((v) => v.id === vehicleId)!;
}

async function main() {
  const login = await api("POST", "/auth/login", {
    email: "local-admin@test.com",
    password: "test1234",
  });
  TOKEN = (login.json as { token: string }).token;
  check("管理員登入", Boolean(TOKEN));

  // 建測試機車（初始里程 10000）
  const created = await api("POST", "/vehicles", {
    plateNumber: "E2E-BASELINE",
    type: "MOTORCYCLE",
    initialMileage: 10000,
  });
  check("建立測試車輛", created.status === 201, created.json);
  const vehicleId = (created.json as { id: string }).id;

  try {
    let status = await getStatus(vehicleId);
    const oil = status.maintenanceItems.find((m) => m.itemName === "機油")!;
    check("機油初始基準 10000", oil.lastChangeMileage === 10000, oil);

    // 登記機油更換，故意填錯里程 10500（正確應為 10200）
    const marked = await api("PATCH", `/vehicles/${vehicleId}/maintenance/${oil.id}`, {
      mileage: 10500,
      date: "2026-07-15",
      cost: 200,
    });
    check("登記保養（錯誤里程 10500）", marked.status === 200, marked.json);

    status = await getStatus(vehicleId);
    check("登記後基準為 10500", status.maintenanceItems.find((m) => m.itemName === "機油")!.lastChangeMileage === 10500);

    // 找到剛建立的履歷並修正里程為 10200
    const logs = (await api("GET", `/vehicles/${vehicleId}/logs`)).json as { logs: { id: string; itemName: string }[] };
    const log = logs.logs.find((l) => l.itemName === "機油")!;
    const edited = await api("PUT", `/vehicles/${vehicleId}/logs/${log.id}`, { mileage: 10200, date: "2026-07-14" });
    check("編輯履歷里程改為 10200", edited.status === 200, edited.json);

    // ★ Bug 驗證重點：保養項目基準應同步為 10200
    status = await getStatus(vehicleId);
    const oilAfter = status.maintenanceItems.find((m) => m.itemName === "機油")!;
    check("編輯後基準同步為 10200", oilAfter.lastChangeMileage === 10200, oilAfter);
    check("編輯後上次更換日期同步為 2026-07-14", (oilAfter.lastChangeAt ?? "").startsWith("2026-07-14"), oilAfter);

    // 刪除履歷後：無其他機油履歷，基準保留不變
    const del = await api("DELETE", `/vehicles/${vehicleId}/logs/${log.id}`);
    check("刪除履歷", del.status === 204);
    status = await getStatus(vehicleId);
    check("刪除後基準保留 10200（無履歷可對應）",
      status.maintenanceItems.find((m) => m.itemName === "機油")!.lastChangeMileage === 10200);

    // 手動新增更新的機油履歷，基準應跟著更新
    const added = await api("POST", `/vehicles/${vehicleId}/logs`, {
      date: "2026-07-18",
      itemName: "機油",
      mileage: 10800,
      category: "MAINTENANCE",
    });
    check("手動新增機油履歷", added.status === 201, added.json);
    status = await getStatus(vehicleId);
    check("新增後基準同步為 10800",
      status.maintenanceItems.find((m) => m.itemName === "機油")!.lastChangeMileage === 10800);
  } finally {
    const del = await api("DELETE", `/vehicles/${vehicleId}`);
    check("清除測試車輛", del.status === 204, del.json);
  }

  console.log(`\n結果：${passed} 通過 / ${failed} 失敗`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
