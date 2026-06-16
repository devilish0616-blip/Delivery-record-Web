import { useState, type ComponentType } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  CalendarCheck,
  CalendarClock,
  CircleUserRound,
  ClipboardList,
  Gauge,
  Home,
  LayoutDashboard,
  LogOut,
  MapPin,
  Receipt,
  Route,
  Scale,
  Settings,
  Truck,
  Users,
  Wallet,
  type LucideProps,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";

type IconType = ComponentType<LucideProps>;

interface NavItem {
  to: string;
  label: string;
  icon: IconType;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

// EMPLOYEE：依功能分區（核心作業／人事行政）
const employeeNavSections: NavSection[] = [
  {
    title: "核心作業",
    items: [
      { to: "/", label: "首頁", icon: Home },
      { to: "/delivery", label: "每日送件記錄", icon: ClipboardList },
      { to: "/mileage", label: "車輛里程記錄", icon: Gauge },
    ],
  },
  {
    title: "人事行政",
    items: [
      { to: "/my-schedule", label: "我的排班", icon: CalendarClock },
      { to: "/salary/me", label: "我的薪資", icon: Wallet },
      { to: "/leaves", label: "請假申請", icon: CalendarCheck },
    ],
  },
];

// MANAGER：依功能分區（核心作業／物流與派遣／人事行政），與 ADMIN 採同一套分類方式
const managerNavSections: NavSection[] = [
  {
    title: "核心作業",
    items: [
      { to: "/", label: "首頁", icon: Home },
      { to: "/admin", label: "儀表板", icon: LayoutDashboard },
      { to: "/delivery", label: "每日送件記錄", icon: ClipboardList },
      { to: "/mileage", label: "車輛里程記錄", icon: Gauge },
    ],
  },
  {
    title: "物流與派遣",
    items: [
      { to: "/admin/dispatch", label: "派遣紀錄", icon: Route },
      { to: "/admin/vehicles", label: "車輛管理", icon: Truck },
    ],
  },
  {
    title: "人事行政",
    items: [
      { to: "/admin/employees", label: "員工管理", icon: Users },
      { to: "/regions", label: "區域管理", icon: MapPin },
      { to: "/schedule", label: "排班管理", icon: CalendarClock },
      { to: "/salary/me", label: "我的薪資", icon: Wallet },
      { to: "/admin/salary", label: "薪資查詢", icon: Wallet },
      { to: "/leaves", label: "請假申請", icon: CalendarCheck },
      { to: "/admin/leaves", label: "請假管理", icon: Scale },
    ],
  },
];

// REGION_MANAGER：簡化版側邊欄，僅顯示與自己區域相關的功能
const regionManagerNavSections: NavSection[] = [
  {
    title: "核心作業",
    items: [
      { to: "/my-region", label: "我的區域", icon: MapPin },
      { to: "/delivery", label: "每日送件記錄", icon: ClipboardList },
      { to: "/mileage", label: "車輛里程記錄", icon: Gauge },
    ],
  },
  {
    title: "人事行政",
    items: [
      { to: "/schedule", label: "排班管理", icon: CalendarClock },
      { to: "/salary/me", label: "我的薪資", icon: Wallet },
      { to: "/leaves", label: "請假申請", icon: CalendarCheck },
    ],
  },
];

// ADMIN：依功能分區（核心作業／物流與派遣／人事行政／系統設定）
const adminNavSections: NavSection[] = [
  {
    title: "核心作業",
    items: [
      { to: "/", label: "首頁", icon: Home },
      { to: "/admin", label: "儀表板", icon: LayoutDashboard },
      { to: "/delivery", label: "每日送件記錄", icon: ClipboardList },
    ],
  },
  {
    title: "物流與派遣",
    items: [
      { to: "/admin/reconciliation", label: "貨運行對帳", icon: Receipt },
      { to: "/admin/dispatch", label: "派遣紀錄", icon: Route },
      { to: "/admin/vehicles", label: "車輛管理", icon: Truck },
    ],
  },
  {
    title: "人事行政",
    items: [
      { to: "/admin/employees", label: "員工管理", icon: Users },
      { to: "/regions", label: "區域管理", icon: MapPin },
      { to: "/schedule", label: "排班管理", icon: CalendarClock },
      { to: "/admin/salary", label: "薪資計算", icon: Wallet },
      { to: "/leaves", label: "請假申請", icon: CalendarCheck },
      { to: "/admin/leaves", label: "請假管理", icon: Scale },
    ],
  },
  {
    title: "系統設定",
    items: [{ to: "/admin/settings", label: "系統設定", icon: Settings }],
  },
];

const roleLabels: Record<string, string> = {
  ADMIN: "管理者",
  MANAGER: "主管",
  REGION_MANAGER: "區域經理",
  EMPLOYEE: "員工",
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  let sections: NavSection[];
  if (user?.role === "ADMIN") {
    sections = adminNavSections;
  } else if (user?.role === "MANAGER") {
    sections = managerNavSections;
  } else if (user?.role === "REGION_MANAGER") {
    sections = regionManagerNavSections;
  } else {
    sections = employeeNavSections;
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
        className={`${menuOpen ? "flex flex-col" : "hidden"} border-b border-gray-200 bg-white md:flex md:w-60 md:flex-shrink-0 md:flex-col md:border-b-0 md:border-r`}
      >
        <div className="hidden px-4 py-5 md:block">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="旭寺物流" className="h-9 w-9" />
            <span className="text-lg font-semibold text-gray-800">旭寺物流</span>
          </Link>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {sections.map((section, idx) => (
            <div key={idx} className={idx > 0 ? "mt-3 border-t border-gray-200 pt-3" : ""}>
              {section.title && (
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end
                        onClick={() => setMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 border-l-4 px-2.5 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`
                        }
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 px-3 py-3">
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
            <CircleUserRound className="h-9 w-9 flex-shrink-0 text-gray-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{user?.name}</p>
              <p className="text-xs text-gray-400">{roleLabels[user?.role ?? ""] ?? user?.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
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
