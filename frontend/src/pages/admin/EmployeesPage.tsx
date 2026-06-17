import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { User } from "../../api/types";

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
                  <th className="px-4 py-2">所屬區域</th>
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
                            <span
                              key={r.id}
                              className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                            >
                              {r.name}
                              {r.isManager ? "（主管）" : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/admin/employees/${u.id}/records`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            查看紀錄
                          </Link>
                          <button
                            type="button"
                            onClick={() => openResetPassword(u)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            重設密碼
                          </button>
                          {u.id !== user?.id && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
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
