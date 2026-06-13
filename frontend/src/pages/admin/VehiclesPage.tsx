import { Fragment, useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { DailyRoleType, VehicleStatus, VehicleType, VehicleUsageRecord } from "../../api/types";

const typeLabels: Record<VehicleType, string> = {
  MOTORCYCLE: "機車",
  TRUCK: "貨車",
};

const roleLabels: Record<DailyRoleType, string> = {
  NONE: "無",
  TRUCK_DRIVER: "貨車司機",
  TRUCK_ATTENDANT: "貨車隨車人員",
};

function vehicleTypeLabel(type: VehicleType | undefined): string {
  return type ? typeLabels[type] ?? type : "-";
}

export function VehiclesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canMaintain = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [vehicles, setVehicles] = useState<VehicleStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("TRUCK");
  const [note, setNote] = useState("");
  const [initialMileage, setInitialMileage] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlate, setEditPlate] = useState("");
  const [editType, setEditType] = useState<VehicleType>("TRUCK");
  const [editNote, setEditNote] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editMileage, setEditMileage] = useState(0);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemInterval, setNewItemInterval] = useState(1000);

  const [usageRecords, setUsageRecords] = useState<VehicleUsageRecord[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<VehicleStatus | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [maintenanceTarget, setMaintenanceTarget] = useState<VehicleStatus | null>(null);
  const [maintenanceItemId, setMaintenanceItemId] = useState("");
  const [maintenanceMileage, setMaintenanceMileage] = useState("");
  const [maintenanceNote, setMaintenanceNote] = useState("");
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

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
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(v: VehicleStatus) {
    setEditingId(v.id);
    setEditPlate(v.plateNumber);
    setEditType(v.type);
    setEditNote(v.note ?? "");
    setEditActive(v.isActive);
    setEditMileage(v.currentMileage ?? 0);
  }

  async function handleSaveEdit(id: string) {
    const original = vehicles.find((v) => v.id === id);
    if (original && editType !== original.type) {
      const confirmed = window.confirm("變更車型將會重置預設保養項目，確定要修改嗎？");
      if (!confirmed) return;
    }
    setError(null);
    try {
      await apiClient.put(`/vehicles/${id}`, {
        plateNumber: editPlate.trim(),
        type: editType,
        note: editNote.trim() || null,
        isActive: editActive,
        currentMileage: editMileage,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function toggleExpanded(id: string) {
    const opening = expandedId !== id;
    setExpandedId((current) => (current === id ? null : id));
    setNewItemName("");
    setNewItemInterval(1000);
    if (opening) {
      loadUsage(id);
    } else {
      setUsageRecords([]);
    }
  }

  async function loadUsage(vehicleId: string) {
    setUsageLoading(true);
    try {
      const { data } = await apiClient.get<VehicleUsageRecord[]>(`/vehicles/${vehicleId}/usage`);
      setUsageRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUsageLoading(false);
    }
  }

  function openMaintenance(v: VehicleStatus) {
    setMaintenanceTarget(v);
    setMaintenanceItemId(v.maintenanceItems?.[0]?.id ?? "");
    setMaintenanceMileage(String(v.currentMileage ?? 0));
    setMaintenanceNote("");
    setMaintenanceError(null);
  }

  function closeMaintenance() {
    setMaintenanceTarget(null);
  }

  async function handleSubmitMaintenance() {
    if (!maintenanceTarget || !maintenanceItemId) return;
    setMaintenanceError(null);
    const mileage = Number(maintenanceMileage);
    if (!Number.isFinite(mileage) || mileage < 0) {
      setMaintenanceError("請輸入有效的里程數字");
      return;
    }
    setMaintenanceSubmitting(true);
    try {
      await apiClient.patch(`/vehicles/${maintenanceTarget.id}/maintenance/${maintenanceItemId}`, {
        mileage,
        note: maintenanceNote.trim() || null,
      });
      setMaintenanceTarget(null);
      await load();
    } catch (err) {
      setMaintenanceError(getErrorMessage(err));
    } finally {
      setMaintenanceSubmitting(false);
    }
  }

  async function handleAddItem(vehicleId: string) {
    if (!newItemName.trim() || newItemInterval <= 0) return;
    setError(null);
    try {
      await apiClient.post(`/vehicles/${vehicleId}/maintenance`, {
        itemName: newItemName.trim(),
        intervalKm: newItemInterval,
      });
      setNewItemName("");
      setNewItemInterval(1000);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleDeleteItem(vehicleId: string, itemId: string) {
    setError(null);
    try {
      await apiClient.delete(`/vehicles/${vehicleId}/maintenance/${itemId}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
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

  const columnCount = 7;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">車輛管理</h1>

      {isAdmin && (
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
        {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-5">{error}</p>}
      </form>
      )}
      {!isAdmin && error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          車輛列表
        </h2>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : vehicles.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無車輛資料</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">車牌</th>
                  <th className="px-4 py-2">車型</th>
                  <th className="px-4 py-2">備註</th>
                  <th className="px-4 py-2">目前累計里程</th>
                  <th className="px-4 py-2">保養狀態</th>
                  <th className="px-4 py-2">狀態</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <Fragment key={v.id}>
                    <tr className="border-t border-gray-100">
                      {editingId === v.id ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editPlate}
                              onChange={(e) => setEditPlate(e.target.value)}
                              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as VehicleType)}
                              className="rounded border border-gray-300 px-2 py-1 text-sm"
                            >
                              <option value="TRUCK">貨車</option>
                              <option value="MOTORCYCLE">機車</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={editMileage}
                              onChange={(e) => setEditMileage(Number(e.target.value))}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                            <span className="ml-1 text-xs text-gray-400">km</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-400">-</td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={editActive}
                                onChange={(e) => setEditActive(e.target.checked)}
                              />
                              啟用
                            </label>
                          </td>
                          <td className="px-4 py-2 space-x-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(v.id)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              儲存
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-xs text-gray-500 hover:underline"
                            >
                              取消
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-medium text-gray-800">{v.plateNumber}</td>
                          <td className="px-4 py-2 text-gray-500">{vehicleTypeLabel(v.type)}</td>
                          <td className="px-4 py-2 text-gray-500">{v.note ?? "-"}</td>
                          <td className="px-4 py-2">{v.currentMileage ?? 0} km</td>
                          <td className="px-4 py-2">
                            {(v.maintenanceItems ?? []).map((m) => (
                              <span
                                key={m.id}
                                className={`mr-2 inline-block ${
                                  m.needsChange
                                    ? "font-medium text-red-600"
                                    : m.warning
                                    ? "font-medium text-amber-600"
                                    : "text-gray-500"
                                }`}
                              >
                                {m.itemName} {m.needsChange ? "已逾期" : `剩 ${(m.remaining ?? 0).toFixed(0)} km`}
                              </span>
                            ))}
                          </td>
                          <td className="px-4 py-2">
                            {v.isActive ? (
                              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                啟用
                              </span>
                            ) : (
                              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                                停用
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => startEdit(v)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                編輯
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleExpanded(v.id)}
                              className="text-xs text-emerald-600 hover:underline"
                            >
                              {expandedId === v.id ? "收合" : "詳細資訊"}
                            </button>
                            {canMaintain && (
                              <button
                                type="button"
                                onClick={() => openMaintenance(v)}
                                className="text-xs text-emerald-600 hover:underline"
                              >
                                登記維修
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteTarget(v);
                                  setDeleteConfirmText("");
                                }}
                                className="text-xs text-red-600 hover:underline"
                              >
                                刪除
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                    {expandedId === v.id && (
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td colSpan={columnCount} className="px-4 py-3">
                          <table className="w-full text-left text-xs">
                            <thead className="text-gray-500">
                              <tr>
                                <th className="px-2 py-1">項目</th>
                                <th className="px-2 py-1">週期</th>
                                <th className="px-2 py-1">上次更換里程</th>
                                <th className="px-2 py-1">上次更換時間</th>
                                <th className="px-2 py-1">上次備註</th>
                                <th className="px-2 py-1">距下次</th>
                                <th className="px-2 py-1"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(v.maintenanceItems ?? []).map((m) => (
                                <tr key={m.id} className="border-t border-gray-200">
                                  <td className="px-2 py-1">{m.itemName}</td>
                                  <td className="px-2 py-1">{m.intervalKm} km</td>
                                  <td className="px-2 py-1">{m.lastChangeMileage} km</td>
                                  <td className="px-2 py-1">
                                    {m.lastChangeAt ? m.lastChangeAt.slice(0, 10) : "-"}
                                  </td>
                                  <td className="px-2 py-1">{m.lastChangeNote ?? "-"}</td>
                                  <td
                                    className={`px-2 py-1 ${
                                      m.needsChange
                                        ? "font-medium text-red-600"
                                        : m.warning
                                        ? "font-medium text-amber-600"
                                        : ""
                                    }`}
                                  >
                                    {m.needsChange ? "已逾期" : `${(m.remaining ?? 0).toFixed(0)} km`}
                                  </td>
                                  <td className="px-2 py-1">
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteItem(v.id, m.id)}
                                        className="text-red-600 hover:underline"
                                      >
                                        刪除項目
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {isAdmin && (
                            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-200 pt-3">
                              <div>
                                <label className="mb-1 block text-xs text-gray-500">新增保養項目名稱</label>
                                <input
                                  type="text"
                                  value={newItemName}
                                  onChange={(e) => setNewItemName(e.target.value)}
                                  className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs text-gray-500">更換週期 (km)</label>
                                <input
                                  type="number"
                                  value={newItemInterval}
                                  onChange={(e) => setNewItemInterval(Number(e.target.value))}
                                  className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddItem(v.id)}
                                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                              >
                                新增項目
                              </button>
                            </div>
                          )}

                          <div className="mt-4 border-t border-gray-200 pt-3">
                            <h3 className="mb-2 text-xs font-semibold text-gray-600">
                              使用紀錄（最近 30 筆，可協助判斷是否停用）
                            </h3>
                            {usageLoading ? (
                              <p className="text-xs text-gray-500">載入中...</p>
                            ) : usageRecords.length === 0 ? (
                              <p className="text-xs text-gray-500">尚無使用紀錄</p>
                            ) : (
                              <table className="w-full text-left text-xs">
                                <thead className="text-gray-500">
                                  <tr>
                                    <th className="px-2 py-1">日期</th>
                                    <th className="px-2 py-1">使用人員</th>
                                    <th className="px-2 py-1">今日角色</th>
                                    <th className="px-2 py-1">起始里程</th>
                                    <th className="px-2 py-1">結束里程</th>
                                    <th className="px-2 py-1">行駛距離</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {usageRecords.map((r) => (
                                    <tr key={r.id} className="border-t border-gray-200">
                                      <td className="px-2 py-1">{r.date.slice(0, 10)}</td>
                                      <td className="px-2 py-1">{r.userName}</td>
                                      <td className="px-2 py-1">{roleLabels[r.role]}</td>
                                      <td className="px-2 py-1">{r.startMileage}</td>
                                      <td className="px-2 py-1">{r.endMileage}</td>
                                      <td className="px-2 py-1">{r.distance} km</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

      {maintenanceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-800">
              登記維修 - {maintenanceTarget.plateNumber}
            </h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">目前里程</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={maintenanceMileage}
                    onChange={(e) => setMaintenanceMileage(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-sm text-gray-400">km</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">維修項目</label>
                <select
                  value={maintenanceItemId}
                  onChange={(e) => setMaintenanceItemId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {(maintenanceTarget.maintenanceItems ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.itemName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">備註（選填）</label>
                <input
                  type="text"
                  value={maintenanceNote}
                  onChange={(e) => setMaintenanceNote(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              {maintenanceError && <p className="text-sm text-red-600">{maintenanceError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeMaintenance}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={maintenanceSubmitting || !maintenanceItemId}
                onClick={handleSubmitMaintenance}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {maintenanceSubmitting ? "送出中..." : "確認"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
