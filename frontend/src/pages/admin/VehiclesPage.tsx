import { useEffect, useState, type FormEvent } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { VehicleStatus } from "../../api/types";

export function VehiclesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [vehicles, setVehicles] = useState<VehicleStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plateNumber, setPlateNumber] = useState("");
  const [note, setNote] = useState("");
  const [lastOilChangeMileage, setLastOilChangeMileage] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlate, setEditPlate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editActive, setEditActive] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<VehicleStatus[]>("/vehicles");
      setVehicles(data);
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
        note: note.trim() || null,
        lastOilChangeMileage,
      });
      setPlateNumber("");
      setNote("");
      setLastOilChangeMileage(0);
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
    setEditNote(v.note ?? "");
    setEditActive(v.isActive);
  }

  async function handleSaveEdit(id: string) {
    setError(null);
    try {
      await apiClient.put(`/vehicles/${id}`, {
        plateNumber: editPlate.trim(),
        note: editNote.trim() || null,
        isActive: editActive,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleOilChange(id: string) {
    setError(null);
    try {
      await apiClient.patch(`/vehicles/${id}/oil-change`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">車輛管理</h1>

      {isAdmin && (
      <form
        onSubmit={handleCreate}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
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
          <label className="mb-1 block text-sm font-medium text-gray-700">備註（選填）</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">目前累計里程（換機油基準）</label>
          <input
            type="number"
            value={lastOilChangeMileage}
            onChange={(e) => setLastOilChangeMileage(Number(e.target.value))}
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
        {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{error}</p>}
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
                  <th className="px-4 py-2">備註</th>
                  <th className="px-4 py-2">目前累計里程</th>
                  <th className="px-4 py-2">上次換機油里程</th>
                  <th className="px-4 py-2">距下次換機油</th>
                  <th className="px-4 py-2">狀態</th>
                  {isAdmin && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-t border-gray-100">
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
                          <input
                            type="text"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2 text-gray-500">{v.currentMileage} km</td>
                        <td className="px-4 py-2 text-gray-500">{v.lastOilChangeMileage} km</td>
                        <td className="px-4 py-2 text-gray-500">{v.remainingToOilChange} km</td>
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
                        <td className="px-4 py-2 text-gray-500">{v.note ?? "-"}</td>
                        <td className="px-4 py-2">{v.currentMileage} km</td>
                        <td className="px-4 py-2 text-gray-500">{v.lastOilChangeMileage} km</td>
                        <td
                          className={`px-4 py-2 ${
                            v.oilChangeWarning ? "font-medium text-red-600" : ""
                          }`}
                        >
                          {v.remainingToOilChange} km
                          {v.needsOilChange && "（已逾期）"}
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
                        {isAdmin && (
                          <td className="px-4 py-2 space-x-2">
                            <button
                              type="button"
                              onClick={() => startEdit(v)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              編輯
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOilChange(v.id)}
                              className="text-xs text-emerald-600 hover:underline"
                            >
                              標記已換機油
                            </button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
