import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { Capability, JobPosition, PayGrade, Role, User } from "../../api/types";

type Tab = "profile" | "position";

const CAPABILITY_OPTIONS: { key: Capability; label: string }[] = [
  { key: "MANAGE_VEHICLES", label: "車輛管理" },
  { key: "MANAGE_SCHEDULE", label: "排班" },
  { key: "MANAGE_FINANCE", label: "記帳（記的帳需董事長審核）" },
];

const roleLabels: Record<Role, string> = {
  ADMIN: "董事長",
  MANAGER: "執行長",
  EMPLOYEE: "員工",
};

function capabilityLabel(cap: Capability): string {
  return CAPABILITY_OPTIONS.find((c) => c.key === cap)?.label ?? cap;
}

export function EmployeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [tab, setTab] = useState<Tab>("profile");
  const [users, setUsers] = useState<User[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [payGrades, setPayGrades] = useState<PayGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const editingUser = users.find((u) => u.id === editingUserId) ?? null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, posRes, gradesRes] = await Promise.all([
        apiClient.get<User[]>("/employees"),
        apiClient.get<JobPosition[]>("/job-positions"),
        apiClient.get<PayGrade[]>("/pay-grades"),
      ]);
      setUsers(usersRes.data);
      setPositions(posRes.data);
      setPayGrades(gradesRes.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // ── 職務指派（可複選） ──
  async function handleAddJobPosition(userId: string, jobPositionId: string, since?: string | null) {
    setError(null);
    try {
      await apiClient.post(`/employees/${userId}/job-positions/${jobPositionId}`, { since: since || null });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }
  async function handleRemoveJobPosition(userId: string, jobPositionId: string) {
    setError(null);
    try {
      await apiClient.delete(`/employees/${userId}/job-positions/${jobPositionId}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  // ── 職等指派 ──
  async function handlePayGradeChange(id: string, payGradeId: string) {
    setError(null);
    try {
      await apiClient.patch(`/employees/${id}/pay-grade`, { payGradeId: payGradeId || null });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  // ── 網頁使用權限（直接授予，不透過職務） ──
  async function handleCapabilitiesChange(id: string, capabilities: Capability[]) {
    setError(null);
    try {
      await apiClient.patch(`/employees/${id}/capabilities`, { capabilities });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleStatusToggle(id: string, isActive: boolean) {
    setError(null);
    try {
      await apiClient.patch(`/employees/${id}/status`, { isActive });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleDeleteUser(u: User) {
    if (!window.confirm(`確定要刪除帳號「${u.name}」嗎？此操作無法復原。`)) return;
    setError(null);
    try {
      await apiClient.delete(`/employees/${u.id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  // ── 角色 ──
  async function handleRoleChange(id: string, role: Role) {
    setError(null);
    try {
      await apiClient.patch(`/employees/${id}/role`, { role });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  // ── 密碼重設 ──
  function openResetPassword(u: User) {
    setResetTarget(u);
    setNewPassword("");
    setConfirmPassword("");
    setResetError(null);
    setResetSuccess(false);
  }
  function closeResetPassword() {
    setResetTarget(null);
  }
  async function handleResetPassword() {
    if (!resetTarget) return;
    setResetError(null);
    if (newPassword.length < 6) return setResetError("密碼至少需要 6 個字元");
    if (newPassword !== confirmPassword) return setResetError("兩次輸入的密碼不一致");
    setResetSubmitting(true);
    try {
      await apiClient.put(`/employees/${resetTarget.id}/password`, { password: newPassword });
      setResetSuccess(true);
    } catch (err) {
      setResetError(getErrorMessage(err));
    } finally {
      setResetSubmitting(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "員工資料" },
    { key: "position", label: "職務加給設定" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">員工管理</h1>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : (
        <>
          {tab === "profile" && (
            <ProfileTab
              users={users}
              isAdmin={isAdmin}
              currentUserId={user?.id}
              onEdit={(u) => setEditingUserId(u.id)}
              onStatusToggle={handleStatusToggle}
              onResetPassword={openResetPassword}
              onDeleteUser={handleDeleteUser}
            />
          )}
          {tab === "position" && (
            <PositionTab positions={positions} isAdmin={isAdmin} reload={load} onError={setError} />
          )}
        </>
      )}

      {editingUser && isAdmin && (
        <AccessModal
          user={editingUser}
          positions={positions}
          payGrades={payGrades}
          onClose={() => setEditingUserId(null)}
          onRoleChange={handleRoleChange}
          onPayGradeChange={handlePayGradeChange}
          onCapabilitiesChange={handleCapabilitiesChange}
          onAddJobPosition={handleAddJobPosition}
          onRemoveJobPosition={handleRemoveJobPosition}
        />
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-800">重設密碼 - {resetTarget.name}</h3>
            {resetSuccess ? (
              <>
                <p className="mt-3 text-sm text-green-600">密碼已更新</p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeResetPassword}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    關閉
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">新密碼</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">確認密碼</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  {resetError && <p className="text-sm text-red-600">{resetError}</p>}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeResetPassword}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={resetSubmitting}
                    onClick={handleResetPassword}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {resetSubmitting ? "送出中..." : "確認送出"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 員工資料分頁 ────────────────────────────────────────────────────────────
function ProfileTab({
  users,
  isAdmin,
  currentUserId,
  onEdit,
  onStatusToggle,
  onResetPassword,
  onDeleteUser,
}: {
  users: User[];
  isAdmin: boolean;
  currentUserId?: string;
  onEdit: (u: User) => void;
  onStatusToggle: (id: string, isActive: boolean) => void;
  onResetPassword: (u: User) => void;
  onDeleteUser: (u: User) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2">姓名</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">所屬區域</th>
              <th className="px-4 py-2">角色／職等／職務</th>
              <th className="px-4 py-2">帳號狀態</th>
              {isAdmin && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-800">{u.name}</td>
                <td className="px-4 py-2 text-gray-500">{u.email}</td>
                <td className="px-4 py-2">
                  {!u.regions || u.regions.length === 0 ? (
                    <span className="text-gray-400">-</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.regions.map((r) => (
                        <span key={r.id} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                          {r.name}
                          {r.isManager ? "（主管）" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {roleLabels[u.role]}
                    </span>
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      {u.payGrade?.name ?? "預設職等"}
                    </span>
                    {(u.jobPositions ?? []).map((jp) => (
                      <span key={jp.id} className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                        {jp.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => onStatusToggle(u.id, !u.isActive)}
                      className={`rounded px-2 py-1 text-xs ${
                        u.isActive
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {u.isActive ? "啟用中" : "已停用"}
                    </button>
                  ) : (
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {u.isActive ? "啟用中" : "已停用"}
                    </span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(u)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        編輯權限與職等
                      </button>
                      <Link
                        to={`/admin/employees/${u.id}/records`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        查看紀錄
                      </Link>
                      <button
                        type="button"
                        onClick={() => onResetPassword(u)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        重設密碼
                      </button>
                      {u.id !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => onDeleteUser(u)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          刪除帳號
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 編輯權限與職等彈窗：角色／職等／職務（可複選）／網頁使用權限 ──────────
function AccessModal({
  user,
  positions,
  payGrades,
  onClose,
  onRoleChange,
  onPayGradeChange,
  onCapabilitiesChange,
  onAddJobPosition,
  onRemoveJobPosition,
}: {
  user: User;
  positions: JobPosition[];
  payGrades: PayGrade[];
  onClose: () => void;
  onRoleChange: (id: string, role: Role) => void;
  onPayGradeChange: (id: string, payGradeId: string) => void;
  onCapabilitiesChange: (id: string, capabilities: Capability[]) => void;
  onAddJobPosition: (userId: string, jobPositionId: string, since?: string | null) => void;
  onRemoveJobPosition: (userId: string, jobPositionId: string) => void;
}) {
  const activePositions = positions.filter((p) => p.isActive);
  const activeGrades = payGrades.filter((g) => g.isActive);
  const assignedIds = new Set((user.jobPositions ?? []).map((jp) => jp.id));
  const extraCapabilities = user.extraCapabilities ?? [];

  function toggleCapability(cap: Capability) {
    const next = extraCapabilities.includes(cap)
      ? extraCapabilities.filter((c) => c !== cap)
      : [...extraCapabilities, cap];
    onCapabilitiesChange(user.id, next);
  }

  function toggleJobPosition(jobPositionId: string, checked: boolean) {
    if (checked) {
      onAddJobPosition(user.id, jobPositionId, null);
    } else {
      onRemoveJobPosition(user.id, jobPositionId);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">編輯權限與職等 - {user.name}</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            關閉
          </button>
        </div>

        <div className="mt-4 space-y-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">角色</label>
            <select
              value={user.role}
              onChange={(e) => onRoleChange(user.id, e.target.value as Role)}
              className="w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="EMPLOYEE">員工</option>
              <option value="MANAGER">執行長</option>
              <option value="ADMIN">董事長</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              職等（決定薪資自動計算公式）
            </label>
            <select
              value={user.payGradeId ?? ""}
              onChange={(e) => onPayGradeChange(user.id, e.target.value)}
              className="w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">使用預設職等</option>
              {activeGrades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">職務（可複選，各自可設定任職起始日）</label>
            {activePositions.length === 0 ? (
              <p className="text-sm text-gray-400">尚無可指派的職務，請先於「職務加給設定」分頁新增。</p>
            ) : (
              <div className="space-y-2">
                {activePositions.map((p) => {
                  const assignment = (user.jobPositions ?? []).find((jp) => jp.id === p.id);
                  const checked = assignedIds.has(p.id);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-3 rounded border border-gray-200 px-3 py-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleJobPosition(p.id, e.target.checked)}
                        />
                        {p.name}（${p.allowance.toLocaleString()}）
                      </label>
                      {checked && (
                        <label className="flex items-center gap-1 text-xs text-gray-500">
                          任職起
                          <input
                            type="date"
                            value={assignment?.since ? assignment.since.slice(0, 10) : ""}
                            onChange={(e) => onAddJobPosition(user.id, p.id, e.target.value || null)}
                            className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              網頁使用權限（直接授予，與職務解鎖的權限取聯集）
            </label>
            <div className="flex flex-wrap gap-3">
              {CAPABILITY_OPTIONS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={extraCapabilities.includes(c.key)}
                    onChange={() => toggleCapability(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            {(user.capabilities ?? []).length > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                目前實際生效權限：{(user.capabilities ?? []).map(capabilityLabel).join("、")}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 職務加給設定分頁 ────────────────────────────────────────────────────────
const emptyDraft = { name: "", allowance: 0, capabilities: [] as Capability[] };

function PositionTab({
  positions,
  isAdmin,
  reload,
  onError,
}: {
  positions: JobPosition[];
  isAdmin: boolean;
  reload: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null); // null=未編輯, "new"=新增
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  function startNew() {
    setEditingId("new");
    setDraft(emptyDraft);
  }
  function startEdit(p: JobPosition) {
    setEditingId(p.id);
    setDraft({ name: p.name, allowance: p.allowance, capabilities: [...p.capabilities] });
  }
  function cancel() {
    setEditingId(null);
    setDraft(emptyDraft);
  }
  function toggleCap(cap: Capability) {
    setDraft((d) => ({
      ...d,
      capabilities: d.capabilities.includes(cap)
        ? d.capabilities.filter((c) => c !== cap)
        : [...d.capabilities, cap],
    }));
  }

  async function save() {
    if (!draft.name.trim()) return onError("請輸入職務名稱");
    onError(null);
    setSaving(true);
    try {
      if (editingId === "new") {
        await apiClient.post("/job-positions", draft);
      } else {
        await apiClient.put(`/job-positions/${editingId}`, draft);
      }
      cancel();
      await reload();
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: JobPosition) {
    onError(null);
    try {
      await apiClient.put(`/job-positions/${p.id}`, { isActive: !p.isActive });
      await reload();
    } catch (err) {
      onError(getErrorMessage(err));
    }
  }

  async function remove(p: JobPosition) {
    if (
      !window.confirm(
        `確定刪除職務「${p.name}」？${p.memberCount > 0 ? `\n目前有 ${p.memberCount} 位員工指派此職務，請先於員工資料頁解除指派後才能刪除。` : ""}`
      )
    )
      return;
    onError(null);
    try {
      await apiClient.delete(`/job-positions/${p.id}`);
      await reload();
    } catch (err) {
      onError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
        職務為「固定月加給」與「模組使用權限」的組合，可複選指派給同一位員工。
      </div>

      {isAdmin && editingId === null && (
        <button
          type="button"
          onClick={startNew}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          + 新增職務
        </button>
      )}

      {isAdmin && editingId !== null && (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
          <p className="text-sm font-medium text-gray-700">
            {editingId === "new" ? "新增職務" : "編輯職務"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">職務名稱</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="例：車輛管理組長"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">固定月加給（元）</label>
              <input
                type="number"
                min={0}
                value={draft.allowance}
                onChange={(e) => setDraft((d) => ({ ...d, allowance: Number(e.target.value) }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">解鎖模組權限</label>
            <div className="flex flex-wrap gap-3">
              {CAPABILITY_OPTIONS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={draft.capabilities.includes(c.key)}
                    onChange={() => toggleCap(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "儲存中..." : "儲存"}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {positions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無職務，請新增。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">職務名稱</th>
                  <th className="px-4 py-2">固定加給</th>
                  <th className="px-4 py-2">模組權限</th>
                  <th className="px-4 py-2">指派人數</th>
                  <th className="px-4 py-2">狀態</th>
                  {isAdmin && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className={`border-t border-gray-100 ${p.isActive ? "" : "opacity-60"}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                    <td className="px-4 py-2">${p.allowance.toLocaleString()}</td>
                    <td className="px-4 py-2">
                      {p.capabilities.length === 0 ? (
                        <span className="text-gray-400">無</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {p.capabilities.map((c) => (
                            <span
                              key={c}
                              className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                            >
                              {capabilityLabel(c)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">{p.memberCount}</td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => toggleActive(p)}
                          className={`rounded px-2 py-1 text-xs ${
                            p.isActive
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {p.isActive ? "啟用中" : "已停用"}
                        </button>
                      ) : (
                        <span className="text-gray-600">{p.isActive ? "啟用中" : "已停用"}</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
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
