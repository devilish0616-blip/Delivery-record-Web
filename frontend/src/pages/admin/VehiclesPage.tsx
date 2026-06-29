import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type {
  DailyRoleType,
  DocumentStatus,
  MaintenanceItemStatus,
  MaintenanceLogData,
  VehicleStatus,
  VehicleType,
  VehicleUsageRecord,
} from "../../api/types";

const typeLabels: Record<VehicleType, string> = {
  MOTORCYCLE: "機車",
  TRUCK: "貨車",
};

const roleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

const docOrder: { key: DocumentStatus["key"]; label: string }[] = [
  { key: "insuranceCompulsoryExpiry", label: "強制險" },
  { key: "insuranceLiabilityExpiry", label: "第三人責任險" },
  { key: "inspectionExpiry", label: "驗車" },
  { key: "licenseTaxDueDate", label: "牌照稅" },
  { key: "fuelTaxDueDate", label: "燃料稅" },
];

type Health = "red" | "amber" | "green";

function vehicleHealth(v: VehicleStatus): Health {
  if (v.needsMaintenance || v.documentExpired || v.openRepairCount > 0) return "red";
  if (v.maintenanceWarning || v.documentExpiring) return "amber";
  return "green";
}

const healthStyles: Record<Health, { dot: string; ring: string; label: string }> = {
  red: { dot: "bg-red-500", ring: "border-red-200", label: "需處理" },
  amber: { dot: "bg-amber-400", ring: "border-amber-200", label: "即將到期" },
  green: { dot: "bg-emerald-500", ring: "border-emerald-200", label: "正常" },
};

function fmtDate(d: string | null): string {
  return d ? d.slice(0, 10) : "-";
}

function maintenanceLabel(m: MaintenanceItemStatus): { text: string; cls: string } {
  const parts: string[] = [];
  if (m.needsChange) {
    return { text: "已逾期", cls: "font-medium text-red-600" };
  }
  parts.push(`剩 ${m.remaining.toFixed(0)} km`);
  if (m.remainingDays !== null) parts.push(`${m.remainingDays} 天`);
  return {
    text: parts.join(" / "),
    cls: m.warning ? "font-medium text-amber-600" : "text-gray-500",
  };
}

function docLabel(d: DocumentStatus): { text: string; cls: string } {
  if (!d.date) return { text: "未設定", cls: "text-gray-300" };
  if (d.expired) return { text: `已逾期（${fmtDate(d.date)}）`, cls: "font-medium text-red-600" };
  if (d.expiring) return { text: `剩 ${d.daysUntil} 天`, cls: "font-medium text-amber-600" };
  return { text: fmtDate(d.date), cls: "text-gray-500" };
}

export function VehiclesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canMaintain = user?.role === "ADMIN" || user?.role === "MANAGER";

  const [vehicles, setVehicles] = useState<VehicleStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 新增車輛
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("TRUCK");
  const [note, setNote] = useState("");
  const [initialMileage, setInitialMileage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // 詳情 modal
  const [detailId, setDetailId] = useState<string | null>(null);

  // 刪除
  const [deleteTarget, setDeleteTarget] = useState<VehicleStatus | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<VehicleStatus[]>("/vehicles");
      setVehicles(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!plateNumber.trim()) {
      setError("請輸入車牌號碼");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post("/vehicles", {
        plateNumber: plateNumber.trim(),
        type: vehicleType,
        note: note.trim() || null,
        initialMileage,
      });
      setPlateNumber("");
      setNote("");
      setInitialMileage(0);
      setVehicleType("TRUCK");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteVehicle() {
    if (!deleteTarget) return;
    setError(null);
    try {
      await apiClient.delete(`/vehicles/${deleteTarget.id}`);
      setDeleteTarget(null);
      setDeleteConfirmText("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const detailVehicle = vehicles.find((v) => v.id === detailId) ?? null;

  const summary = {
    total: vehicles.length,
    red: vehicles.filter((v) => v.isActive && vehicleHealth(v) === "red").length,
    amber: vehicles.filter((v) => v.isActive && vehicleHealth(v) === "amber").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">車輛管理</h1>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showCreate ? "收合新增表單" : "＋ 新增車輛"}
          </button>
        )}
      </div>

      {/* 健康總覽 */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg border border-gray-200 bg-white px-4 py-2">
          車輛總數 <span className="font-semibold text-gray-800">{summary.total}</span>
        </span>
        <span className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-red-700">
          需處理 <span className="font-semibold">{summary.red}</span>
        </span>
        <span className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-amber-700">
          即將到期 <span className="font-semibold">{summary.amber}</span>
        </span>
      </div>

      {isAdmin && showCreate && (
        <form
          onSubmit={handleCreate}
          className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">車牌號碼</label>
            <input
              type="text"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">車型</label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="TRUCK">貨車</option>
              <option value="MOTORCYCLE">機車</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">備註（選填）</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">目前累計里程</label>
            <input
              type="number"
              value={initialMileage}
              onChange={(e) => setInitialMileage(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "新增中..." : "新增車輛"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 車輛卡片牆 */}
      {loading ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : vehicles.length === 0 ? (
        <p className="text-sm text-gray-500">尚無車輛資料</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => {
            const health = vehicleHealth(v);
            const style = healthStyles[health];
            const dueDocs = v.documents.filter((d) => d.expired || d.expiring);
            const dueItems = v.maintenanceItems.filter((m) => m.needsChange || m.warning);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setDetailId(v.id)}
                className={`flex flex-col rounded-xl border-2 bg-white p-4 text-left shadow-sm transition hover:shadow-md ${style.ring} ${
                  v.isActive ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${style.dot}`} />
                    <span className="text-lg font-semibold text-gray-800">{v.plateNumber}</span>
                  </div>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    {typeLabels[v.type]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {v.currentMileage.toLocaleString()} km {v.isActive ? "" : "· 已停用"}
                </p>

                <div className="mt-3 space-y-1 text-xs">
                  {v.openRepairCount > 0 && (
                    <p className="font-medium text-red-600">🔧 {v.openRepairCount} 筆待處理報修</p>
                  )}
                  {dueItems.length > 0 ? (
                    dueItems.slice(0, 3).map((m) => {
                      const lb = maintenanceLabel(m);
                      return (
                        <p key={m.id} className={lb.cls}>
                          {m.itemName} · {lb.text}
                        </p>
                      );
                    })
                  ) : (
                    <p className="text-gray-400">保養項目正常</p>
                  )}
                  {dueDocs.map((d) => {
                    const lb = docLabel(d);
                    return (
                      <p key={d.key} className={lb.cls}>
                        {d.label} · {lb.text}
                      </p>
                    );
                  })}
                </div>

                <div className="mt-3 border-t border-gray-100 pt-2 text-right text-xs font-medium text-blue-600">
                  查看詳情 →
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detailVehicle && (
        <VehicleDetailModal
          vehicle={detailVehicle}
          canMaintain={canMaintain}
          isAdmin={isAdmin}
          onClose={() => setDetailId(null)}
          onChanged={load}
          onRequestDelete={(v) => {
            setDetailId(null);
            setDeleteTarget(v);
            setDeleteConfirmText("");
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-800">刪除車輛</h3>
            <p className="mt-2 text-sm text-gray-600">
              此操作無法復原。請輸入車牌號碼{" "}
              <span className="font-semibold text-gray-800">{deleteTarget.plateNumber}</span> 以確認刪除。
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder={deleteTarget.plateNumber}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmText("");
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== deleteTarget.plateNumber}
                onClick={handleDeleteVehicle}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 車輛詳情 Modal：基本資料 / 證件 / 保養項目 / 維修履歷 / 使用紀錄
// ---------------------------------------------------------------------------

interface DetailProps {
  vehicle: VehicleStatus;
  canMaintain: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onRequestDelete: (v: VehicleStatus) => void;
}

type Tab = "info" | "docs" | "maintenance" | "history" | "usage";

function VehicleDetailModal({ vehicle, canMaintain, isAdmin, onClose, onChanged, onRequestDelete }: DetailProps) {
  const [tab, setTab] = useState<Tab>("maintenance");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-3xl rounded-lg bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${healthStyles[vehicleHealth(vehicle)].dot}`} />
            <h2 className="text-lg font-semibold text-gray-800">{vehicle.plateNumber}</h2>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {typeLabels[vehicle.type]} · {vehicle.currentMileage.toLocaleString()} km
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-gray-200 px-3 pt-2 text-sm">
          {([
            ["maintenance", "保養項目"],
            ["history", "維修履歷"],
            ["docs", "證件/稅務"],
            ["usage", "使用紀錄"],
            ["info", "基本資料"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-t-md px-3 py-2 ${
                tab === key
                  ? "border-b-2 border-blue-600 font-medium text-blue-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5">
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {tab === "maintenance" && (
            <MaintenanceTab vehicle={vehicle} canMaintain={canMaintain} onChanged={onChanged} setError={setError} />
          )}
          {tab === "history" && <HistoryTab vehicle={vehicle} canMaintain={canMaintain} setError={setError} />}
          {tab === "docs" && (
            <DocsTab vehicle={vehicle} canMaintain={canMaintain} onChanged={onChanged} setError={setError} />
          )}
          {tab === "usage" && <UsageTab vehicleId={vehicle.id} setError={setError} />}
          {tab === "info" && (
            <InfoTab
              vehicle={vehicle}
              isAdmin={isAdmin}
              onChanged={onChanged}
              onRequestDelete={onRequestDelete}
              setError={setError}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- 保養項目 tab（含里程+天數雙週期、編輯、登記維修、新增/刪除）---
function MaintenanceTab({
  vehicle,
  canMaintain,
  onChanged,
  setError,
}: {
  vehicle: VehicleStatus;
  canMaintain: boolean;
  onChanged: () => Promise<void>;
  setError: (s: string | null) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eKm, setEKm] = useState(1000);
  const [eDays, setEDays] = useState<string>("");

  const [newName, setNewName] = useState("");
  const [newKm, setNewKm] = useState(1000);
  const [newDays, setNewDays] = useState<string>("");

  // 登記維修
  const [changeItem, setChangeItem] = useState<MaintenanceItemStatus | null>(null);
  const [cMileage, setCMileage] = useState("");
  const [cDate, setCDate] = useState("");
  const [cCost, setCCost] = useState("");
  const [cVendor, setCVendor] = useState("");
  const [cNote, setCNote] = useState("");
  const [busy, setBusy] = useState(false);

  function startEdit(m: MaintenanceItemStatus) {
    setEditingId(m.id);
    setEName(m.itemName);
    setEKm(m.intervalKm);
    setEDays(m.intervalDays ? String(m.intervalDays) : "");
  }

  async function saveEdit(itemId: string) {
    if (!eName.trim() || eKm <= 0) {
      setError("請輸入有效的項目名稱與更換週期");
      return;
    }
    setError(null);
    try {
      await apiClient.put(`/vehicles/${vehicle.id}/maintenance/${itemId}`, {
        itemName: eName.trim(),
        intervalKm: eKm,
        intervalDays: eDays ? Number(eDays) : null,
      });
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function addItem() {
    if (!newName.trim() || newKm <= 0) {
      setError("請輸入有效的項目名稱與更換週期");
      return;
    }
    setError(null);
    try {
      await apiClient.post(`/vehicles/${vehicle.id}/maintenance`, {
        itemName: newName.trim(),
        intervalKm: newKm,
        intervalDays: newDays ? Number(newDays) : null,
      });
      setNewName("");
      setNewKm(1000);
      setNewDays("");
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function deleteItem(itemId: string) {
    setError(null);
    try {
      await apiClient.delete(`/vehicles/${vehicle.id}/maintenance/${itemId}`);
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function openChange(m: MaintenanceItemStatus) {
    setChangeItem(m);
    setCMileage(String(vehicle.currentMileage));
    setCDate(new Date().toISOString().slice(0, 10));
    setCCost("");
    setCVendor("");
    setCNote("");
  }

  async function submitChange() {
    if (!changeItem) return;
    const mileage = Number(cMileage);
    if (!Number.isFinite(mileage) || mileage < 0) {
      setError("請輸入有效的里程");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.patch(`/vehicles/${vehicle.id}/maintenance/${changeItem.id}`, {
        mileage,
        date: cDate || undefined,
        cost: cCost ? Number(cCost) : undefined,
        vendor: cVendor.trim() || null,
        note: cNote.trim() || null,
      });
      setChangeItem(null);
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-gray-500">
          <tr>
            <th className="px-2 py-1">項目</th>
            <th className="px-2 py-1">里程週期</th>
            <th className="px-2 py-1">時間週期</th>
            <th className="px-2 py-1">上次更換</th>
            <th className="px-2 py-1">距下次</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {vehicle.maintenanceItems.map((m) =>
            editingId === m.id ? (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="px-2 py-1">
                  <input
                    value={eName}
                    onChange={(e) => setEName(e.target.value)}
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    value={eKm}
                    onChange={(e) => setEKm(Number(e.target.value))}
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                  />{" "}
                  km
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    value={eDays}
                    placeholder="無"
                    onChange={(e) => setEDays(e.target.value)}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                  />{" "}
                  天
                </td>
                <td className="px-2 py-1 text-gray-400">{fmtDate(m.lastChangeAt)}</td>
                <td className="px-2 py-1">-</td>
                <td className="space-x-2 px-2 py-1 whitespace-nowrap">
                  <button onClick={() => saveEdit(m.id)} className="text-blue-600 hover:underline">
                    儲存
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-gray-500 hover:underline">
                    取消
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="px-2 py-1 font-medium text-gray-700">{m.itemName}</td>
                <td className="px-2 py-1 text-gray-500">{m.intervalKm} km</td>
                <td className="px-2 py-1 text-gray-500">{m.intervalDays ? `${m.intervalDays} 天` : "-"}</td>
                <td className="px-2 py-1 text-gray-500">
                  {fmtDate(m.lastChangeAt)}
                  {m.lastChangeMileage ? ` · ${m.lastChangeMileage} km` : ""}
                </td>
                <td className={`px-2 py-1 ${maintenanceLabel(m).cls}`}>{maintenanceLabel(m).text}</td>
                <td className="space-x-2 px-2 py-1 whitespace-nowrap">
                  {canMaintain && (
                    <>
                      <button onClick={() => openChange(m)} className="text-emerald-600 hover:underline">
                        登記維修
                      </button>
                      <button onClick={() => startEdit(m)} className="text-blue-600 hover:underline">
                        編輯
                      </button>
                      <button onClick={() => deleteItem(m.id)} className="text-red-600 hover:underline">
                        刪除
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>

      {canMaintain && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-gray-200 pt-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">新增項目名稱</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">里程週期 (km)</label>
            <input
              type="number"
              value={newKm}
              onChange={(e) => setNewKm(Number(e.target.value))}
              className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">時間週期 (天，選填)</label>
            <input
              type="number"
              value={newDays}
              onChange={(e) => setNewDays(e.target.value)}
              className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <button
            onClick={addItem}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            新增項目
          </button>
        </div>
      )}

      {changeItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-800">登記維修 - {changeItem.itemName}</h3>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <label className="mb-1 block font-medium text-gray-700">維修日期</label>
                <input
                  type="date"
                  value={cDate}
                  onChange={(e) => setCDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-gray-700">當時里程 (km)</label>
                <input
                  type="number"
                  value={cMileage}
                  onChange={(e) => setCMileage(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-gray-700">費用（選填）</label>
                <input
                  type="number"
                  value={cCost}
                  onChange={(e) => setCCost(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-gray-700">廠商／技師（選填）</label>
                <input
                  value={cVendor}
                  onChange={(e) => setCVendor(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-gray-700">備註（選填）</label>
                <input
                  value={cNote}
                  onChange={(e) => setCNote(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setChangeItem(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={submitChange}
                disabled={busy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "送出中..." : "確認並記錄"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 維修履歷 tab（時間軸 + 費用統計 + 手動新增/刪除）---
function HistoryTab({
  vehicle,
  canMaintain,
  setError,
}: {
  vehicle: VehicleStatus;
  canMaintain: boolean;
  setError: (s: string | null) => void;
}) {
  const [data, setData] = useState<MaintenanceLogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [itemName, setItemName] = useState("");
  const [mileage, setMileage] = useState(String(vehicle.currentMileage));
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await apiClient.get<MaintenanceLogData>(`/vehicles/${vehicle.id}/logs`);
      setData(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id]);

  async function addLog() {
    if (!itemName.trim()) {
      setError("請輸入維修／保養項目");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/vehicles/${vehicle.id}/logs`, {
        date,
        itemName: itemName.trim(),
        mileage: mileage ? Number(mileage) : undefined,
        cost: cost ? Number(cost) : undefined,
        vendor: vendor.trim() || null,
        note: note.trim() || null,
      });
      setItemName("");
      setCost("");
      setVendor("");
      setNote("");
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteLog(logId: string) {
    setError(null);
    try {
      await apiClient.delete(`/vehicles/${vehicle.id}/logs/${logId}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      {data && (
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg bg-gray-50 px-3 py-2">
            累計花費 <span className="font-semibold text-gray-800">${data.summary.totalCost.toLocaleString()}</span>
          </span>
          <span className="rounded-lg bg-gray-50 px-3 py-2">
            今年 <span className="font-semibold text-gray-800">${data.summary.yearCost.toLocaleString()}</span>
          </span>
          <span className="rounded-lg bg-gray-50 px-3 py-2">
            本月 <span className="font-semibold text-gray-800">${data.summary.monthCost.toLocaleString()}</span>
          </span>
          <span className="rounded-lg bg-gray-50 px-3 py-2">
            紀錄 <span className="font-semibold text-gray-800">{data.summary.count}</span> 筆
          </span>
        </div>
      )}

      {canMaintain && (
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          {showAdd ? "收合" : "＋ 新增一筆維修履歷（含臨時維修）"}
        </button>
      )}

      {showAdd && (
        <div className="mb-4 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">項目（自由填寫）</label>
            <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="例：補胎、換燈泡、烤漆" className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">當時里程</label>
            <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">費用</label>
            <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">廠商／技師</label>
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">備註</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </div>
          <div className="sm:col-span-2">
            <button onClick={addLog} disabled={busy} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
              {busy ? "新增中..." : "新增履歷"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : !data || data.logs.length === 0 ? (
        <p className="text-sm text-gray-500">尚無維修保養履歷</p>
      ) : (
        <ol className="relative space-y-4 border-l-2 border-gray-100 pl-4">
          {data.logs.map((log) => (
            <li key={log.id} className="relative">
              <span className="absolute -left-[1.30rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {log.itemName}
                    {log.cost > 0 && <span className="ml-2 text-emerald-600">${log.cost.toLocaleString()}</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {fmtDate(log.date)} · {log.mileage.toLocaleString()} km
                    {log.vendor ? ` · ${log.vendor}` : ""}
                    {log.createdByName ? ` · 登記：${log.createdByName}` : ""}
                  </p>
                  {log.note && <p className="mt-0.5 text-xs text-gray-400">{log.note}</p>}
                </div>
                {canMaintain && (
                  <button onClick={() => deleteLog(log.id)} className="text-xs text-red-600 hover:underline">
                    刪除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// --- 證件/稅務 tab ---
function DocsTab({
  vehicle,
  canMaintain,
  onChanged,
  setError,
}: {
  vehicle: VehicleStatus;
  canMaintain: boolean;
  onChanged: () => Promise<void>;
  setError: (s: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function startEdit() {
    const init: Record<string, string> = {};
    for (const { key } of docOrder) {
      const v = vehicle[key] as string | null;
      init[key] = v ? v.slice(0, 10) : "";
    }
    setValues(init);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, string | null> = {};
      for (const { key } of docOrder) payload[key] = values[key] || null;
      await apiClient.put(`/vehicles/${vehicle.id}`, payload);
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-3">
        {docOrder.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">{label}</label>
            <input
              type="date"
              value={values[key] ?? ""}
              onChange={(e) => setValues((s) => ({ ...s, [key]: e.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setEditing(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
            取消
          </button>
          <button onClick={save} disabled={busy} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? "儲存中..." : "儲存"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {vehicle.documents.map((d) => {
        const lb = docLabel(d);
        return (
          <div key={d.key} className="flex items-center justify-between border-b border-gray-100 py-2 text-sm">
            <span className="text-gray-600">{d.label}</span>
            <span className={lb.cls}>{lb.text}</span>
          </div>
        );
      })}
      {canMaintain && (
        <button onClick={startEdit} className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100">
          編輯到期日
        </button>
      )}
    </div>
  );
}

// --- 使用紀錄 tab ---
function UsageTab({ vehicleId, setError }: { vehicleId: string; setError: (s: string | null) => void }) {
  const [records, setRecords] = useState<VehicleUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get<VehicleUsageRecord[]>(`/vehicles/${vehicleId}/usage`);
        setRecords(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  if (loading) return <p className="text-sm text-gray-500">載入中...</p>;
  if (records.length === 0) return <p className="text-sm text-gray-500">尚無使用紀錄</p>;

  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-gray-500">
        <tr>
          <th className="px-2 py-1">日期</th>
          <th className="px-2 py-1">使用人員</th>
          <th className="px-2 py-1">今日角色</th>
          <th className="px-2 py-1">結束里程</th>
          <th className="px-2 py-1">行駛距離</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.id} className="border-t border-gray-100">
            <td className="px-2 py-1">{fmtDate(r.date)}</td>
            <td className="px-2 py-1">{r.userName}</td>
            <td className="px-2 py-1">{roleLabels[r.role]}</td>
            <td className="px-2 py-1">{r.endMileage}</td>
            <td className="px-2 py-1">{r.distance !== null ? `${r.distance} km` : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- 基本資料 tab（車牌/車型/備註/里程/啟用 + 刪除）---
function InfoTab({
  vehicle,
  isAdmin,
  onChanged,
  onRequestDelete,
  setError,
}: {
  vehicle: VehicleStatus;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  onRequestDelete: (v: VehicleStatus) => void;
  setError: (s: string | null) => void;
}) {
  const [plate, setPlate] = useState(vehicle.plateNumber);
  const [type, setType] = useState<VehicleType>(vehicle.type);
  const [note, setNote] = useState(vehicle.note ?? "");
  const [active, setActive] = useState(vehicle.isActive);
  const [mileage, setMileage] = useState(vehicle.currentMileage);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (type !== vehicle.type && !window.confirm("變更車型將會重置預設保養項目，確定要修改嗎？")) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.put(`/vehicles/${vehicle.id}`, {
        plateNumber: plate.trim(),
        type,
        note: note.trim() || null,
        isActive: active,
        currentMileage: mileage,
      });
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-2 text-sm text-gray-600">
        <p>車牌：{vehicle.plateNumber}</p>
        <p>車型：{typeLabels[vehicle.type]}</p>
        <p>目前里程：{vehicle.currentMileage.toLocaleString()} km</p>
        <p>備註：{vehicle.note ?? "-"}</p>
        <p>狀態：{vehicle.isActive ? "啟用" : "停用"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="mb-1 block font-medium text-gray-700">車牌號碼</label>
        <input value={plate} onChange={(e) => setPlate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
      </div>
      <div>
        <label className="mb-1 block font-medium text-gray-700">車型</label>
        <select value={type} onChange={(e) => setType(e.target.value as VehicleType)} className="w-full rounded-md border border-gray-300 px-3 py-2">
          <option value="TRUCK">貨車</option>
          <option value="MOTORCYCLE">機車</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block font-medium text-gray-700">目前累計里程</label>
        <input type="number" value={mileage} onChange={(e) => setMileage(Number(e.target.value))} className="w-full rounded-md border border-gray-300 px-3 py-2" />
      </div>
      <div>
        <label className="mb-1 block font-medium text-gray-700">備註</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        啟用
      </label>
      <div className="flex justify-between pt-2">
        <button onClick={() => onRequestDelete(vehicle)} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
          刪除車輛
        </button>
        <button onClick={save} disabled={busy} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
          {busy ? "儲存中..." : "儲存"}
        </button>
      </div>
    </div>
  );
}
