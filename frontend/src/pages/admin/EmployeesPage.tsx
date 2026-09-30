import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { Capability, JobPosition, PayGrade, Role, User } from "../../api/types";

type Tab = "profile" | "position";
type Filter = "all" | "active" | "regionManager" | "proxy" | "inactive" | "noRegion" | "defaultGrade";

type ProfilePatch = { name?: string; accountNote?: string | null; isProxyManaged?: boolean; canLogin?: boolean };

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

const ROLE_ORDER: Role[] = ["EMPLOYEE", "MANAGER", "ADMIN"];

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

  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
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

  // 所有修改動作共用：送出後重新載入，失敗時顯示錯誤
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const handleAddJobPosition = (userId: string, jobPositionId: string, since?: string | null) =>
    run(() => apiClient.post(`/employees/${userId}/job-positions/${jobPositionId}`, { since: since || null }));
  const handleRemoveJobPosition = (userId: string, jobPositionId: string) =>
    run(() => apiClient.delete(`/employees/${userId}/job-positions/${jobPositionId}`));
  const handlePayGradeChange = (id: string, payGradeId: string) =>
    run(() => apiClient.patch(`/employees/${id}/pay-grade`, { payGradeId: payGradeId || null }));
  // 網頁使用權限（直接授予，不透過職務）
  const handleCapabilitiesChange = (id: string, capabilities: Capability[]) =>
    run(() => apiClient.patch(`/employees/${id}/capabilities`, { capabilities }));
  const handleStatusToggle = (id: string, isActive: boolean) =>
    run(() => apiClient.patch(`/employees/${id}/status`, { isActive }));
  // 顯示名稱／帳號備註／代管設定
  const handleProfileChange = (id: string, patch: ProfilePatch) =>
    run(() => apiClient.patch(`/employees/${id}/profile`, patch));
  const handleRoleChange = (id: string, role: Role) =>
    run(() => apiClient.patch(`/employees/${id}/role`, { role }));

  async function handleDeleteUser(u: User) {
    if (!window.confirm(`確定要刪除帳號「${u.name}」嗎？此操作無法復原。`)) return;
    await run(() => apiClient.delete(`/employees/${u.id}`));
    setSelectedId(null);
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">員工管理</h1>
          <p className="mt-0.5 text-sm text-gray-500">帳號、角色、職等、職務與權限集中管理</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                tab === t.key
                  ? "bg-white font-semibold text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">載入中...</p>
      ) : (
        <>
          {tab === "profile" && (
            <ProfileTab
              users={users}
              positions={positions}
              payGrades={payGrades}
              isAdmin={isAdmin}
              currentUserId={user?.id}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onStatusToggle={handleStatusToggle}
              onResetPassword={openResetPassword}
              onDeleteUser={handleDeleteUser}
              onRoleChange={handleRoleChange}
              onProfileChange={handleProfileChange}
              onPayGradeChange={handlePayGradeChange}
              onCapabilitiesChange={handleCapabilitiesChange}
              onAddJobPosition={handleAddJobPosition}
              onRemoveJobPosition={handleRemoveJobPosition}
            />
          )}
          {tab === "position" && (
            <PositionTab positions={positions} isAdmin={isAdmin} reload={load} onError={setError} />
          )}
        </>
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

// ─── 員工資料分頁：統計卡＋篩選列表＋右側編輯面板 ───────────────────────────
type EditHandlers = {
  onStatusToggle: (id: string, isActive: boolean) => void;
  onResetPassword: (u: User) => void;
  onDeleteUser: (u: User) => void;
  onRoleChange: (id: string, role: Role) => void;
  onPayGradeChange: (id: string, payGradeId: string) => void;
  onCapabilitiesChange: (id: string, capabilities: Capability[]) => void;
  onAddJobPosition: (userId: string, jobPositionId: string, since?: string | null) => void;
  onRemoveJobPosition: (userId: string, jobPositionId: string) => void;
  onProfileChange: (id: string, patch: ProfilePatch) => Promise<void>;
};

function ProfileTab({
  users,
  positions,
  payGrades,
  isAdmin,
  currentUserId,
  selectedId,
  onSelect,
  ...handlers
}: {
  users: User[];
  positions: JobPosition[];
  payGrades: PayGrade[];
  isAdmin: boolean;
  currentUserId?: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
} & EditHandlers) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [regionId, setRegionId] = useState("");

  const noRegion = (u: User) => !u.regions || u.regions.length === 0;
  const isRegionManager = (u: User) => (u.regions ?? []).some((r) => r.isManager);

  const counts = {
    all: users.length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    proxy: users.filter((u) => u.isActive && u.isProxyManaged).length,
    regionManager: users.filter(isRegionManager).length,
    noRegion: users.filter((u) => u.isActive && noRegion(u)).length,
    defaultGrade: users.filter((u) => u.isActive && !u.payGradeId).length,
  };

  const regionOptions = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => (u.regions ?? []).forEach((r) => map.set(r.id, r.name)));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-Hant"));
  }, [users]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (
      q &&
      ![u.name, u.email, u.accountNote ?? "", u.originalName ?? ""].some((t) => t.toLowerCase().includes(q))
    )
      return false;
    if (regionId && !(u.regions ?? []).some((r) => r.id === regionId)) return false;
    switch (filter) {
      case "active":
        return u.isActive;
      case "proxy":
        return u.isActive && !!u.isProxyManaged;
      case "inactive":
        return !u.isActive;
      case "regionManager":
        return isRegionManager(u);
      case "noRegion":
        return u.isActive && noRegion(u);
      case "defaultGrade":
        return u.isActive && !u.payGradeId;
      default:
        return true;
    }
  });

  const selected = users.find((u) => u.id === selectedId) ?? null;
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "active", label: "啟用中" },
    { key: "regionManager", label: "區域主管" },
    { key: "proxy", label: "代管帳號" },
    { key: "inactive", label: "已停用" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="啟用中帳號" value={counts.active} />
        <StatCard label="已停用" value={counts.inactive} muted />
        <StatCard
          label="尚未指派區域"
          value={counts.noRegion}
          warn={counts.noRegion > 0}
          onClick={counts.noRegion > 0 ? () => setFilter("noRegion") : undefined}
        />
        <StatCard
          label="使用預設職等"
          value={counts.defaultGrade}
          warn={counts.defaultGrade > 0}
          onClick={counts.defaultGrade > 0 ? () => setFilter("defaultGrade") : undefined}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
            <label className="flex h-9 w-full items-center gap-2 rounded-md border border-gray-300 px-2.5 sm:w-60">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋姓名或 Email"
                aria-label="搜尋員工"
                className="min-w-0 flex-1 border-none text-sm focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)}>
                  {c.label} {counts[c.key]}
                </FilterChip>
              ))}
              {(filter === "noRegion" || filter === "defaultGrade") && (
                <FilterChip active warn onClick={() => setFilter("all")}>
                  {filter === "noRegion" ? "未指派區域" : "預設職等"} {counts[filter]} ✕
                </FilterChip>
              )}
            </div>
            {regionOptions.length > 0 && (
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                aria-label="區域篩選"
                className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700 sm:ml-auto"
              >
                <option value="">所有區域</option>
                {regionOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="hidden grid-cols-[2.2fr_1.6fr_2fr_80px] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500 md:grid">
            <div>員工</div>
            <div>所屬區域</div>
            <div>角色／職等／職務</div>
            <div>狀態</div>
          </div>

          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">沒有符合條件的員工</p>
          ) : (
            <ul>
              {filtered.map((u) => {
                const isSelected = u.id === selectedId;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(isSelected ? null : u.id)}
                      className={`grid w-full gap-2 border-b border-gray-100 px-4 py-2.5 text-left transition-colors md:grid-cols-[2.2fr_1.6fr_2fr_80px] md:items-center md:gap-3 ${
                        isSelected ? "bg-blue-50 shadow-[inset_3px_0_0_#1d4ed8]" : "hover:bg-gray-50"
                      } ${u.isActive ? "" : "opacity-60"}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={u.name} active={isSelected} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-gray-800">{u.name}</span>
                            {u.isProxyManaged && (
                              <span className="shrink-0 rounded bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-800">代管</span>
                            )}
                            {u.canLogin === false && (
                              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">不可登入</span>
                            )}
                          </div>
                          <div className="truncate font-mono text-xs text-gray-500">{u.email}</div>
                          {u.accountNote && (
                            <div className="truncate text-xs text-gray-500" title={u.accountNote}>{u.accountNote}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {noRegion(u) ? (
                          <span className="rounded border border-dashed border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-800">
                            未指派區域
                          </span>
                        ) : (
                          (u.regions ?? []).map((r) => (
                            <span
                              key={r.id}
                              className={`rounded px-2 py-0.5 text-xs ${
                                r.isManager ? "bg-blue-700 text-white" : "bg-blue-50 text-blue-800"
                              }`}
                            >
                              {r.name}
                              {r.isManager ? "・主管" : ""}
                            </span>
                          ))
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {roleLabels[u.role]}
                        </span>
                        {u.payGrade ? (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                            {u.payGrade.name}
                          </span>
                        ) : (
                          <span className="rounded border border-dashed border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-800">
                            預設職等
                          </span>
                        )}
                        {(u.jobPositions ?? []).map((jp) => (
                          <span key={jp.id} className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                            {jp.name}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full ${u.isActive ? "bg-green-600" : "bg-gray-400"}`} />
                        <span className={u.isActive ? "text-green-800" : "text-gray-500"}>
                          {u.isActive ? "啟用中" : "已停用"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="lg:sticky lg:top-4">
          {selected ? (
            <EmployeeDetail
              key={selected.id}
              user={selected}
              positions={positions}
              payGrades={payGrades}
              isAdmin={isAdmin}
              isSelf={selected.id === currentUserId}
              onClose={() => onSelect(null)}
              {...handlers}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
              點選左側員工以{isAdmin ? "檢視與編輯" : "檢視"}詳細資料
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  warn,
  muted,
  onClick,
}: {
  label: string;
  value: number;
  warn?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  const cls = warn ? "border-orange-200 bg-orange-50" : "border-gray-200 bg-white";
  const body = (
    <>
      <div className={`text-xs ${warn ? "text-orange-800" : "text-gray-500"}`}>{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={`font-mono text-2xl font-semibold ${
            warn ? "text-orange-800" : muted ? "text-gray-500" : "text-gray-900"
          }`}
        >
          {value}
        </span>
        {onClick && <span className="text-xs text-orange-800">篩選 →</span>}
      </div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={`rounded-xl border px-4 py-3 text-left shadow-sm hover:brightness-95 ${cls}`}>
      {body}
    </button>
  ) : (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${cls}`}>{body}</div>
  );
}

function FilterChip({
  active,
  warn,
  onClick,
  children,
}: {
  active: boolean;
  warn?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-full border px-3 text-xs ${
        active
          ? warn
            ? "border-orange-400 bg-orange-50 font-semibold text-orange-800"
            : "border-blue-600 bg-blue-50 font-semibold text-blue-700"
          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function Avatar({ name, active, size = "sm" }: { name: string; active?: boolean; size?: "sm" | "lg" }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
        size === "lg" ? "h-11 w-11 text-lg" : "h-8 w-8 text-sm"
      } ${active ? "bg-blue-700 text-white" : "bg-gray-200 text-gray-700"}`}
    >
      {name.charAt(0)}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${
        checked ? (disabled ? "bg-blue-300" : "bg-blue-600") : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

// 帳號名稱：顯示名稱可改（第一次改名時保留原始名稱）＋僅管理者可見的帳號備註
function AccountNameSection({
  user,
  isAdmin,
  onSave,
}: {
  user: User;
  isAdmin: boolean;
  onSave: (patch: ProfilePatch) => Promise<void>;
}) {
  const [name, setName] = useState(user.name);
  const [note, setNote] = useState(user.accountNote ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = name.trim() !== user.name || note.trim() !== (user.accountNote ?? "");

  if (!isAdmin) {
    if (!user.accountNote && !user.originalName) return null;
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
        {user.accountNote && <p className="text-gray-700">{user.accountNote}</p>}
        {user.originalName && <p className="mt-1 text-xs text-gray-500">原名稱：{user.originalName}</p>}
      </div>
    );
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), accountNote: note.trim() || null });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
      <div className="text-xs font-semibold text-gray-500">帳號名稱</div>
      <label className="block text-xs text-gray-600">
        顯示名稱（全站看到的名字）
        <input
          type="text"
          value={name}
          maxLength={50}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </label>
      {user.originalName && user.originalName !== user.name && (
        <p className="text-[11px] text-gray-500">原名稱：{user.originalName}（開帳號時的名字）</p>
      )}
      <label className="block text-xs text-gray-600">
        帳號備註（只有董事長／執行長看得到）
        <textarea
          value={note}
          rows={2}
          maxLength={500}
          onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          placeholder="例如：臨時帳號，實際使用人為○○○"
          className="mt-1 w-full resize-none rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-gray-500">改名不影響登入帳號與歷史紀錄</span>
        {saved && !changed && <span className="text-xs text-green-700">已儲存</span>}
        {changed && (
          <>
            <button
              type="button"
              onClick={() => { setName(user.name); setNote(user.accountNote ?? ""); }}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving || !name.trim()}
              onClick={save}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "儲存中..." : "儲存名稱"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 右側編輯面板：角色／職等／職務（可複選）／網頁使用權限／帳號操作 ─────────
function EmployeeDetail({
  user,
  positions,
  payGrades,
  isAdmin,
  isSelf,
  onClose,
  onStatusToggle,
  onResetPassword,
  onDeleteUser,
  onRoleChange,
  onPayGradeChange,
  onCapabilitiesChange,
  onAddJobPosition,
  onRemoveJobPosition,
  onProfileChange,
}: {
  user: User;
  positions: JobPosition[];
  payGrades: PayGrade[];
  isAdmin: boolean;
  isSelf: boolean;
  onClose: () => void;
} & EditHandlers) {
  const activePositions = positions.filter((p) => p.isActive || (user.jobPositions ?? []).some((jp) => jp.id === p.id));
  const activeGrades = payGrades.filter((g) => g.isActive);
  const defaultGrade = payGrades.find((g) => g.isDefault);
  const assignedIds = new Set((user.jobPositions ?? []).map((jp) => jp.id));
  const extraCapabilities = user.extraCapabilities ?? [];

  // 權限來源：職務解鎖（唯讀）與直接授予（可切換）取聯集
  const jobCapSources = new Map<Capability, string[]>();
  positions
    .filter((p) => assignedIds.has(p.id))
    .forEach((p) => p.capabilities.forEach((c) => jobCapSources.set(c, [...(jobCapSources.get(c) ?? []), p.name])));

  function toggleCapability(cap: Capability) {
    const next = extraCapabilities.includes(cap)
      ? extraCapabilities.filter((c) => c !== cap)
      : [...extraCapabilities, cap];
    onCapabilitiesChange(user.id, next);
  }

  const sectionTitle = "mb-2 text-xs font-semibold text-gray-500";

  return (
    <aside className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <Avatar name={user.name} active size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold text-gray-900">{user.name}</div>
          <div className="truncate font-mono text-xs text-gray-500">{user.email}</div>
        </div>
        {isAdmin ? (
          <label className={`flex items-center gap-2 text-xs ${user.isActive ? "text-green-800" : "text-gray-500"}`}>
            <Switch
              checked={user.isActive}
              label="帳號啟用"
              onChange={() => onStatusToggle(user.id, !user.isActive)}
            />
            {user.isActive ? "啟用" : "停用"}
          </label>
        ) : (
          <span className={`text-xs ${user.isActive ? "text-green-800" : "text-gray-500"}`}>
            {user.isActive ? "啟用中" : "已停用"}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="ml-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
        >
          ✕
        </button>
      </div>

      <div className="space-y-5 px-5 py-4">
        <AccountNameSection user={user} isAdmin={isAdmin} onSave={(patch) => onProfileChange(user.id, patch)} />

        <div>
          <div className={sectionTitle}>帳號使用方式</div>
          <div className="space-y-2">
          <div
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
              user.isProxyManaged ? "border-purple-200 bg-purple-50" : "border-gray-200"
            }`}
          >
            <Switch
              checked={!!user.isProxyManaged}
              disabled={!isAdmin}
              label="代管帳號"
              onChange={() => onProfileChange(user.id, { isProxyManaged: !user.isProxyManaged })}
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800">代管帳號</div>
              <p className="text-xs leading-relaxed text-gray-600">
                由董事長／執行長在「每日送件紀錄 → 代填送件」幫他填，並列入未填提醒。
              </p>
            </div>
          </div>
          <div
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
              user.canLogin === false ? "border-gray-300 bg-gray-50" : "border-gray-200"
            }`}
          >
            <Switch
              checked={user.canLogin !== false}
              disabled={!isAdmin || isSelf || user.role === "ADMIN"}
              label="允許本人登入"
              onChange={() => onProfileChange(user.id, { canLogin: user.canLogin === false })}
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800">允許本人登入</div>
              <p className="text-xs leading-relaxed text-gray-600">
                {user.canLogin === false
                  ? "已關閉：本人無法登入，但帳號仍在使用中，薪資、代填與績效照常計算。"
                  : "不會操作的長輩帳號可以關閉；關閉後已登入的裝置也會立即登出。"}
                {user.role === "ADMIN" && " 董事長帳號必須可登入。"}
              </p>
            </div>
          </div>
          </div>
        </div>

        <div>
          <div className={sectionTitle}>角色</div>
          {isAdmin ? (
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
              {ROLE_ORDER.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => r !== user.role && onRoleChange(user.id, r)}
                  className={`h-8 rounded-md text-sm ${
                    user.role === r ? "bg-white font-semibold text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  {roleLabels[r]}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-800">{roleLabels[user.role]}</p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">職等</span>
            {isAdmin && (
              <Link to="/admin/pay-grades" className="text-xs text-blue-600 hover:underline">
                職等薪資設定 →
              </Link>
            )}
          </div>
          {isAdmin ? (
            <select
              value={user.payGradeId ?? ""}
              onChange={(e) => onPayGradeChange(user.id, e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
            >
              <option value="">使用預設職等{defaultGrade ? `（${defaultGrade.name}）` : ""}</option>
              {activeGrades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-800">{user.payGrade?.name ?? "預設職等"}</p>
          )}
          <p className="mt-1.5 text-xs text-gray-500">職等決定薪資自動計算公式</p>
        </div>

        <div>
          <div className={sectionTitle}>職務（可複選）</div>
          {activePositions.length === 0 ? (
            <p className="text-sm text-gray-400">尚無可指派的職務，請先於「職務加給設定」分頁新增。</p>
          ) : (
            <div className="space-y-2">
              {activePositions.map((p) => {
                const assignment = (user.jobPositions ?? []).find((jp) => jp.id === p.id);
                const checked = assignedIds.has(p.id);
                if (!isAdmin && !checked) return null;
                return (
                  <div
                    key={p.id}
                    className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
                      checked ? "border-blue-200 bg-blue-50/60" : "border-gray-200"
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-2.5">
                      {isAdmin && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            e.target.checked ? onAddJobPosition(user.id, p.id, null) : onRemoveJobPosition(user.id, p.id)
                          }
                          className="h-4 w-4 accent-blue-600"
                        />
                      )}
                      <span className="min-w-0">
                        <span className={`block text-sm ${checked ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                          {p.name}
                        </span>
                        <span className="block text-xs text-gray-500">
                          加給 <span className="font-mono">+${p.allowance.toLocaleString()}</span>
                          {p.capabilities.length > 0 && `・解鎖 ${p.capabilities.map(capabilityLabel).join("、")}`}
                        </span>
                      </span>
                    </label>
                    {checked && (
                      <label className="flex flex-col text-[11px] text-gray-500">
                        任職起
                        {isAdmin ? (
                          <input
                            type="date"
                            value={assignment?.since ? assignment.since.slice(0, 10) : ""}
                            onChange={(e) => onAddJobPosition(user.id, p.id, e.target.value || null)}
                            className="rounded border border-gray-300 px-1 py-0.5 font-mono text-xs"
                          />
                        ) : (
                          <span className="font-mono text-xs text-gray-700">{assignment?.since?.slice(0, 10) ?? "-"}</span>
                        )}
                      </label>
                    )}
                  </div>
                );
              })}
              {!isAdmin && assignedIds.size === 0 && <p className="text-sm text-gray-400">未指派職務</p>}
            </div>
          )}
        </div>

        <div>
          <div className={sectionTitle}>網頁使用權限</div>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {CAPABILITY_OPTIONS.map((c) => {
              const direct = extraCapabilities.includes(c.key);
              const fromJobs = jobCapSources.get(c.key);
              return (
                <div key={c.key} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm text-gray-800">{c.label}</span>
                  {fromJobs && (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700" title={fromJobs.join("、")}>
                      來自職務
                    </span>
                  )}
                  {direct && (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">直接授予</span>
                  )}
                  <Switch
                    checked={direct || !!fromJobs}
                    disabled={!isAdmin || (!!fromJobs && !direct)}
                    label={c.label}
                    onChange={() => toggleCapability(c.key)}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            由職務解鎖的權限需從職務移除；直接授予與職務權限取聯集。
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3">
          <Link
            to={`/admin/employees/${user.id}/records`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
          >
            查看紀錄
          </Link>
          <button
            type="button"
            onClick={() => onResetPassword(user)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
          >
            重設密碼
          </button>
          {!isSelf && (
            <button
              type="button"
              onClick={() => onDeleteUser(user)}
              className="ml-auto rounded-md px-2 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              刪除帳號
            </button>
          )}
        </div>
      )}
    </aside>
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
