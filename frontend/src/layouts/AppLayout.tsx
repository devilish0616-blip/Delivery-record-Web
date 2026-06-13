import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

interface NavItem {
  to: string;
  label: string;
}

const employeeNav: NavItem[] = [
  { to: "/delivery", label: "每日送件記錄" },
  { to: "/mileage", label: "車輛里程記錄" },
  { to: "/salary/me", label: "我的薪資" },
];

const adminNav: NavItem[] = [
  { to: "/admin", label: "儀表板" },
  { to: "/admin/salary", label: "薪資計算" },
  { to: "/admin/dispatch", label: "派遣紀錄" },
  { to: "/admin/reconciliation", label: "貨運行對帳" },
  { to: "/admin/vehicles", label: "車輛管理" },
  { to: "/admin/employees", label: "員工管理" },
  { to: "/admin/settings", label: "系統設定" },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isStaff = user?.role === "ADMIN" || user?.role === "MANAGER";
  const navItems = isStaff ? adminNav : employeeNav;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      {/* 行動裝置頂部列 */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
        <span className="text-lg font-semibold text-gray-800">物流管理系統</span>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          選單
        </button>
      </header>

      {/* 側邊欄 */}
      <nav
        className={`border-b border-gray-200 bg-white md:block md:w-56 md:flex-shrink-0 md:border-b-0 md:border-r ${
          menuOpen ? "block" : "hidden"
        }`}
      >
        <div className="hidden px-4 py-5 md:block">
          <span className="text-lg font-semibold text-gray-800">物流管理系統</span>
        </div>
        <ul className="space-y-1 px-2 py-3">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-500">{user?.name}</p>
          <p className="text-xs text-gray-400">
            {user?.role === "ADMIN" ? "管理者" : user?.role === "MANAGER" ? "主管" : "員工"}
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            登出
          </button>
        </div>
      </nav>

      {/* 主內容 */}
      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
