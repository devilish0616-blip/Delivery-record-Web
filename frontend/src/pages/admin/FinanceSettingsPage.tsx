import { useEffect, useState } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import type {
  FinanceCategory,
  FinanceCategoryKind,
  FinanceParty,
  FinanceSettings,
} from "../../api/types";

const inputClass =
  "rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

// ─── 關係人管理 ──────────────────────────────────────────────────────────────

function PartiesSection({
  parties,
  onChanged,
}: {
  parties: FinanceParty[];
  onChanged: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newIsShareholder, setNewIsShareholder] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">關係人（股東／公款）</h2>
      <p className="mb-3 text-xs text-gray-400">
        「參與股東結算」的關係人會出現在月報的股東結算表；公款帳戶請關閉此選項。停用後不再出現於記帳選單，歷史帳目不受影響。
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新關係人名稱"
          className={inputClass}
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={newIsShareholder}
            onChange={(e) => setNewIsShareholder(e.target.checked)}
          />
          參與股東結算
        </label>
        <button
          type="button"
          disabled={busy || !newName.trim()}
          onClick={() =>
            run(async () => {
              await apiClient.post("/finance/parties", {
                name: newName.trim(),
                isShareholder: newIsShareholder,
              });
              setNewName("");
              setNewIsShareholder(true);
            })
          }
          className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />新增
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-gray-50">
        {parties.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
            {editingId === p.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
                <button
                  type="button"
                  disabled={busy || !editName.trim()}
                  onClick={() =>
                    run(async () => {
                      await apiClient.put(`/finance/parties/${p.id}`, { name: editName.trim() });
                      setEditingId(null);
                    })
                  }
                  className="text-sm text-blue-600 hover:underline disabled:opacity-60"
                >
                  儲存
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-sm text-gray-400">
                  取消
                </button>
              </>
            ) : (
              <>
                <span className={`font-medium ${p.isActive ? "text-gray-800" : "text-gray-400 line-through"}`}>
                  {p.name}
                </span>
                {p.isShareholder && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">股東結算</span>
                )}
                {!p.isActive && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">已停用</span>
                )}
                <span className="ml-auto flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => { setEditingId(p.id); setEditName(p.name); }}
                    className="text-gray-500 hover:text-blue-600"
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        apiClient.put(`/finance/parties/${p.id}`, { isShareholder: !p.isShareholder })
                      )
                    }
                    className="text-gray-500 hover:text-blue-600 disabled:opacity-60"
                  >
                    {p.isShareholder ? "移出結算" : "加入結算"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() => apiClient.put(`/finance/parties/${p.id}`, { isActive: !p.isActive }))
                    }
                    className={`disabled:opacity-60 ${p.isActive ? "text-red-500 hover:text-red-600" : "text-green-600 hover:text-green-700"}`}
                  >
                    {p.isActive ? "停用" : "啟用"}
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 分類管理 ────────────────────────────────────────────────────────────────

function CategoriesSection({
  kind,
  title,
  categories,
  onChanged,
}: {
  kind: FinanceCategoryKind;
  title: string;
  categories: FinanceCategory[];
  onChanged: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = categories.filter((c) => c.kind === kind);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{title}</h2>

      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新分類名稱"
          className={`${inputClass} flex-1`}
        />
        <button
          type="button"
          disabled={busy || !newName.trim()}
          onClick={() =>
            run(async () => {
              await apiClient.post("/finance/categories", { kind, name: newName.trim() });
              setNewName("");
            })
          }
          className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />新增
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-gray-50">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            {editingId === c.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
                <button
                  type="button"
                  disabled={busy || !editName.trim()}
                  onClick={() =>
                    run(async () => {
                      await apiClient.put(`/finance/categories/${c.id}`, { name: editName.trim() });
                      setEditingId(null);
                    })
                  }
                  className="text-sm text-blue-600 hover:underline disabled:opacity-60"
                >
                  儲存
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-sm text-gray-400">
                  取消
                </button>
              </>
            ) : (
              <>
                <span className={c.isActive ? "text-gray-800" : "text-gray-400 line-through"}>
                  {c.name}
                </span>
                {!c.isActive && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">已停用</span>
                )}
                <span className="ml-auto flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                    className="text-gray-500 hover:text-blue-600"
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() => apiClient.put(`/finance/categories/${c.id}`, { isActive: !c.isActive }))
                    }
                    className={`disabled:opacity-60 ${c.isActive ? "text-red-500 hover:text-red-600" : "text-green-600 hover:text-green-700"}`}
                  >
                    {c.isActive ? "停用" : "啟用"}
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 帶入預設關係人 ──────────────────────────────────────────────────────────

const IMPORT_DEFAULT_FIELDS: { key: keyof Omit<FinanceSettings, "id">; label: string }[] = [
  { key: "fuelPartyId", label: "加油回報帶入" },
  { key: "parkingPartyId", label: "停車費回報帶入" },
  { key: "maintenancePartyId", label: "維修履歷帶入" },
  { key: "salaryPartyId", label: "薪資封存帶入" },
];

function ImportDefaultsSection({
  settings,
  parties,
  onChanged,
}: {
  settings: FinanceSettings;
  parties: FinanceParty[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(key: string, value: string) {
    setBusy(true);
    setError(null);
    try {
      await apiClient.put("/finance/settings", { [key]: value || null });
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">帶入中心預設關係人</h2>
      <p className="mb-3 text-xs text-gray-400">帶入時仍可臨時改選，此處僅設定預設值。</p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {IMPORT_DEFAULT_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-xs font-medium text-gray-500">{f.label}</label>
            <select
              value={settings[f.key] ?? ""}
              disabled={busy}
              onChange={(e) => update(f.key, e.target.value)}
              className={`${inputClass} w-full disabled:opacity-60`}
            >
              <option value="">未設定</option>
              {parties.filter((p) => p.isActive).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 主頁面 ──────────────────────────────────────────────────────────────────

export function FinanceSettingsPage() {
  const [parties, setParties] = useState<FinanceParty[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [p, c, s] = await Promise.all([
        apiClient.get<FinanceParty[]>("/finance/parties"),
        apiClient.get<FinanceCategory[]>("/finance/categories"),
        apiClient.get<FinanceSettings>("/finance/settings"),
      ]);
      setParties(p.data);
      setCategories(c.data);
      setSettings(s.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-gray-800">帳務設定</h1>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">載入中...</p>
      ) : (
        <div className="space-y-5">
          <PartiesSection parties={parties} onChanged={load} />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <CategoriesSection kind="EXPENSE" title="支出分類" categories={categories} onChanged={load} />
            <CategoriesSection kind="INCOME" title="收入分類" categories={categories} onChanged={load} />
          </div>
          {settings && (
            <ImportDefaultsSection settings={settings} parties={parties} onChanged={load} />
          )}
        </div>
      )}
    </div>
  );
}
