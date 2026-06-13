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
