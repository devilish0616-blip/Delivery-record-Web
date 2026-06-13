import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

interface NavItem {
  to: string;
  label: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

// EMPLOYEE（也用於 MANAGER 的「每日作業」區）：首頁、每日填寫項目、請假申請
const employeeNav: NavItem[] = [
  { to: "/", label: "首頁" },
  { to: "/delivery", label: "每日送件記錄" },
  { to: "/mileage", label: "車輛里程記錄" },
  { to: "/salary/me", label: "我的薪資" },
  { to: "/leaves", label: "請假申請" },
];

// MANAGER 後台資訊區：查看為主（車輛管理、請假管理可操作）
const managerBackOfficeNav: NavItem[] = [
  { to: "/admin", label: "儀表板" },
  { to: "/admin/dispatch", label: "派遣紀錄統計" },
  { to: "/admin/salary", label: "薪資查詢" },
  { to: "/admin/vehicles", label: "車輛管理" },
  { to: "/admin/employees", label: "員工管理" },
  { to: "/admin/leaves", label: "請假管理" },
];

// ADMIN：維持現有完整功能，並加入首頁、請假申請/管理
const adminNav: NavItem[] = [
  { to: "/", label: "首頁" },
  { to: "/admin", label: "儀表板" },
  { to: "/admin/salary", label: "薪資計算" },
  { to: "/admin/dispatch", label: "派遣紀錄" },
  { to: "/admin/reconciliation", label: "貨運行對帳" },
  { to: "/admin/vehicles", label: "車輛管理" },
  { to: "/admin/employees", label: "員工管理" },
  { to: "/admin/leaves", label: "請假管理" },
  { to: "/admin/settings", label: "系統設定" },
  { to: "/delivery", label: "每日送件記錄" },
  { to: "/leaves", label: "請假申請" },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  let sections: NavSection[];
  if (user?.role === "ADMIN") {
    sections = [{ items: adminNav }];
  } else if (user?.role === "MANAGER") {
    // 功能3：主管導覽列分為「每日作業」與「後台資訊」兩區
    sections = [
      { title: "每日作業", items: employeeNav },
      { title: "後台資訊（查看為主）", items: managerBackOfficeNav },
    ];
  } else {
    sections = [{ items: employeeNav }];
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      {/* 行動裝置頂部列 */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="旭寺物流" className="h-9 w-9" />
          <span className="text-lg font-semibold text-gray-800">旭寺物流</span>
        </Link>
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
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="旭寺物流" className="h-9 w-9" />
            <span className="text-lg font-semibold text-gray-800">旭寺物流</span>
          </Link>
        </div>
        <div className="space-y-1 px-2 py-3">
          {sections.map((section, idx) => (
            <div key={idx} className={idx > 0 ? "mt-3 border-t border-gray-200 pt-3" : ""}>
              {section.title && (
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {section.title}
                </p>
              )}
              <ul className="space-y-1">
                {section.items.map((item) => (
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
            </div>
          ))}
        </div>
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
