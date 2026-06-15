import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import type { Role, RegionListItem, RegionMemberItem, User } from "../../api/types";

const roleLabels: Record<Role, string> = {
  ADMIN: "管理者",
  MANAGER: "主管",
  REGION_MANAGER: "區域經理",
  EMPLOYEE: "員工",
};

export function RegionManagementPage() {
  const [regions, setRegions] = useState<RegionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allUsers, setAllUsers] = useState<User[]>([]);

  // 新增/編輯區域表單
  const [showForm, setShowForm] = useState(false);
  const [editingRegion, setEditingRegion] = useState<RegionListItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [savingRegion, setSavingRegion] = useState(false);

  // 成員管理
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [members, setMembers] = useState<RegionMemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [addingMemberId, setAddingMemberId] = useState("");
  const [memberActionBusy, setMemberActionBusy] = useState<string | null>(null);

  async function loadRegions() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<RegionListItem[]>("/regions");
      setRegions(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRegions();
    apiClient
      .get<User[]>("/employees")
      .then(({ data }) => setAllUsers(data))
      .catch(() => {});
  }, []);

  async function loadMembers(regionId: string) {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const { data } = await apiClient.get<RegionMemberItem[]>(`/regions/${regionId}/members`);
      setMembers(data);
    } catch (err) {
      setMembersError(getErrorMessage(err));
    } finally {
      setMembersLoading(false);
    }
  }

  function selectRegion(id: string) {
    setSelectedRegionId(id);
    setMemberSearch("");
    setAddingMemberId("");
    setMembersError(null);
    loadMembers(id);
  }

  function openCreateForm() {
    setEditingRegion(null);
    setFormName("");
    setFormDescription("");
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(r: RegionListItem) {
    setEditingRegion(r);
    setFormName(r.name);
    setFormDescription(r.description ?? "");
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingRegion(null);
  }

  async function handleSaveRegion() {
    if (!formName.trim()) {
      setFormError("請輸入區域名稱");
      return;
    }
    setSavingRegion(true);
    setFormError(null);
    try {
      if (editingRegion) {
        await apiClient.put(`/regions/${editingRegion.id}`, {
          name: formName,
          description: formDescription || null,
        });
      } else {
        await apiClient.post("/regions", { name: formName, description: formDescription || null });
      }
      closeForm();
      await loadRegions();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSavingRegion(false);
    }
  }

  async function handleToggleActive(r: RegionListItem) {
    setError(null);
    try {
      if (r.isActive) {
        if (!window.confirm(`確定要停用區域「${r.name}」嗎？`)) return;
        await apiClient.delete(`/regions/${r.id}`);
      } else {
        await apiClient.put(`/regions/${r.id}`, { isActive: true });
      }
      await loadRegions();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleAddMember() {
    if (!selectedRegionId || !addingMemberId) return;
    setMemberActionBusy(addingMemberId);
    setMembersError(null);
    try {
      await apiClient.post(`/regions/${selectedRegionId}/members`, { userId: addingMemberId });
      setAddingMemberId("");
      setMemberSearch("");
      await loadMembers(selectedRegionId);
      await loadRegions();
    } catch (err) {
      setMembersError(getErrorMessage(err));
    } finally {
      setMemberActionBusy(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedRegionId) return;
    if (!window.confirm("確定要將此成員從區域移除嗎？")) return;
    setMemberActionBusy(userId);
    setMembersError(null);
    try {
      await apiClient.delete(`/regions/${selectedRegionId}/members/${userId}`);
      await loadMembers(selectedRegionId);
      await loadRegions();
    } catch (err) {
      setMembersError(getErrorMessage(err));
    } finally {
      setMemberActionBusy(null);
    }
  }

  async function handleToggleManager(userId: string, isManager: boolean) {
    if (!selectedRegionId) return;
    setMemberActionBusy(userId);
    setMembersError(null);
    try {
      await apiClient.patch(`/regions/${selectedRegionId}/members/${userId}/manager`, { isManager });
      await loadMembers(selectedRegionId);
    } catch (err) {
      setMembersError(getErrorMessage(err));
    } finally {
      setMemberActionBusy(null);
    }
  }

  const selectedRegion = regions.find((r) => r.id === selectedRegionId) ?? null;
  const memberIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers
    .filter((u) => u.isActive && !memberIds.has(u.id))
    .filter((u) => u.name.toLowerCase().includes(memberSearch.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">區域管理</h1>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新增區域
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : regions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無區域，請先新增</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">名稱</th>
                  <th className="px-4 py-2">說明</th>
                  <th className="px-4 py-2">成員數</th>
                  <th className="px-4 py-2">區域主管</th>
                  <th className="px-4 py-2">狀態</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-gray-100 ${
                      selectedRegionId === r.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-2 text-gray-500">{r.description ?? "-"}</td>
                    <td className="px-4 py-2">{r.memberCount}</td>
                    <td className="px-4 py-2">
                      {r.managers.length === 0 ? (
                        <span className="text-gray-400">未指派</span>
                      ) : (
                        r.managers.map((m) => m.name).join("、")
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-1 text-xs ${
                          r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {r.isActive ? "啟用中" : "已停用"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => selectRegion(r.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {selectedRegionId === r.id ? "收合成員" : "管理成員"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditForm(r)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(r)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          {r.isActive ? "停用" : "啟用"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedRegion && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
            區域成員：{selectedRegion.name}
          </h2>
          {membersError && <p className="px-4 pt-2 text-sm text-red-600">{membersError}</p>}

          {membersLoading ? (
            <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
          ) : (
            <>
              {members.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-500">此區域尚無成員</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-4 py-2">姓名</th>
                        <th className="px-4 py-2">Email</th>
                        <th className="px-4 py-2">角色</th>
                        <th className="px-4 py-2">區域主管</th>
                        <th className="px-4 py-2">帳號狀態</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.userId} className="border-t border-gray-100">
                          <td className="px-4 py-2 font-medium text-gray-800">{m.userName}</td>
                          <td className="px-4 py-2 text-gray-500">{m.email}</td>
                          <td className="px-4 py-2">{roleLabels[m.role] ?? m.role}</td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              disabled={memberActionBusy === m.userId}
                              onClick={() => handleToggleManager(m.userId, !m.isManager)}
                              className={`rounded px-2 py-1 text-xs disabled:opacity-60 ${
                                m.isManager
                                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              }`}
                            >
                              {m.isManager ? "是（點擊取消）" : "否（點擊設為主管）"}
                            </button>
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded px-2 py-1 text-xs ${
                                m.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {m.isActive ? "啟用中" : "已停用"}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              disabled={memberActionBusy === m.userId}
                              onClick={() => handleRemoveMember(m.userId)}
                              className="text-xs text-red-600 hover:underline disabled:opacity-60"
                            >
                              移除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t border-gray-200 p-4">
                <h3 className="mb-2 text-sm font-medium text-gray-700">新增成員</h3>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">搜尋姓名</label>
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => {
                        setMemberSearch(e.target.value);
                        setAddingMemberId("");
                      }}
                      placeholder="輸入姓名搜尋"
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="min-w-[180px]">
                    <label className="mb-1 block text-xs text-gray-500">選擇員工</label>
                    <select
                      value={addingMemberId}
                      onChange={(e) => setAddingMemberId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">請選擇</option>
                      {availableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}（{roleLabels[u.role] ?? u.role}）
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={!addingMemberId || memberActionBusy === addingMemberId}
                    onClick={handleAddMember}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    加入區域
                  </button>
                </div>
                {availableUsers.length === 0 && (
                  <p className="mt-2 text-xs text-gray-400">沒有符合條件的在職員工可加入</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-800">
              {editingRegion ? `編輯區域 - ${editingRegion.name}` : "新增區域"}
            </h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">區域名稱</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">說明</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingRegion}
                onClick={handleSaveRegion}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingRegion ? "儲存中..." : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
