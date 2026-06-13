import { useEffect, useState } from "react";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { Role, SpecialTitle, User } from "../../api/types";

const specialTitleLabels: Record<string, string> = {
  CEO: "執行長",
  SPECIAL: "特殊",
};

const roleLabels: Record<Role, string> = {
  ADMIN: "管理者",
  MANAGER: "主管",
  EMPLOYEE: "員工",
};

export function EmployeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<User[]>("/employees");
      setUsers(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRoleChange(id: string, role: Role) {
    setError(null);
    try {
      await apiClient.patch(`/employees/${id}/role`, { role });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleSpecialTitleChange(id: string, specialTitle: SpecialTitle | "") {
    setError(null);
    try {
      await apiClient.patch(`/employees/${id}/special-title`, {
        specialTitle: specialTitle === "" ? null : specialTitle,
      });
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

  function openResetPassword(u: User) {
    setResetTarget(u);
    setNewPassword("");
    setConfirmPassword("");
    setResetError(null);
    setResetSuccess(false);
  }

  function closeResetPassword() {
    setResetTarget(null);
    setNewPassword("");
    setConfirmPassword("");
    setResetError(null);
    setResetSuccess(false);
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    setResetError(null);
    if (newPassword.length < 6) {
      setResetError("密碼至少需要 6 個字元");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("兩次輸入的密碼不一致");
      return;
    }
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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">員工管理</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">姓名</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">角色</th>
                  <th className="px-4 py-2">特殊職稱</th>
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
                      {isAdmin ? (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="EMPLOYEE">員工</option>
                          <option value="MANAGER">主管</option>
                          <option value="ADMIN">管理者</option>
                        </select>
                      ) : (
                        roleLabels[u.role]
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <select
                          value={u.specialTitle ?? ""}
                          onChange={(e) =>
                            handleSpecialTitleChange(u.id, e.target.value as SpecialTitle | "")
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="">無（一般員工，自動判定）</option>
                          <option value="CEO">{specialTitleLabels.CEO}</option>
                          <option value="SPECIAL">{specialTitleLabels.SPECIAL}</option>
                        </select>
                      ) : (
                        u.specialTitle ? specialTitleLabels[u.specialTitle] : "無（一般員工，自動判定）"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(u.id, !u.isActive)}
                          className={`rounded px-2 py-1 text-xs ${
                            u.isActive
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {u.isActive ? "啟用中（點擊停用）" : "已停用（點擊啟用）"}
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
                        <button
                          type="button"
                          onClick={() => openResetPassword(u)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          重設密碼
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-800">
              重設密碼 - {resetTarget.name}
            </h3>
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
