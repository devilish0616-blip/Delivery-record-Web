import { useState, type ComponentType } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { APP_VERSION } from "../version";
import {
  CalendarCheck,
  CalendarClock,
  CircleUserRound,
  ClipboardList,
  Fuel,
  Gauge,
  Home,
  Import,
  LayoutDashboard,
  LogOut,
  MapPin,
  NotebookPen,
  ParkingSquare,
  PieChart,
  Route,
  Scale,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Wrench,
  type LucideProps,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import type { Capability } from "../api/types";

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

// EMPLOYEE：依功能分區（核心作業／回報作業／人事行政／薪資）
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
    title: "回報作業",
    items: [
      { to: "/fuel-report", label: "加油回報", icon: Fuel },
      { to: "/parking-fee-report", label: "停車費回報", icon: ParkingSquare },
      { to: "/repair-report", label: "車輛報修", icon: Wrench },
    ],
  },
  {
    title: "人事行政",
    items: [
      { to: "/my-schedule", label: "我的排班", icon: CalendarClock },
      { to: "/leaves", label: "請假申請", icon: CalendarCheck },
    ],
  },
  {
    title: "薪資",
    items: [{ to: "/salary/me", label: "我的薪資", icon: Wallet }],
  },
];

// MANAGER：依功能分區（核心作業／物流與派遣／回報與審核／人事行政／薪資），與 ADMIN 採同一套分類方式
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
      { to: "/repair-review", label: "維修管理", icon: Wrench },
    ],
  },
  {
    title: "回報與審核",
    items: [
      { to: "/fuel-report", label: "加油回報", icon: Fuel },
      { to: "/fuel-review", label: "油資審核", icon: Fuel },
      { to: "/parking-fee-report", label: "停車費回報", icon: ParkingSquare },
      { to: "/parking-fee-review", label: "停車費審核", icon: ParkingSquare },
      { to: "/repair-report", label: "車輛報修", icon: Wrench },
    ],
  },
  {
    title: "人事行政",
    items: [
      { to: "/admin/employees", label: "員工管理", icon: Users },
      { to: "/regions", label: "區域管理", icon: MapPin },
      { to: "/schedule", label: "排班管理", icon: CalendarClock },
      { to: "/leaves", label: "請假申請", icon: CalendarCheck },
      { to: "/admin/leaves", label: "請假管理", icon: Scale },
    ],
  },
  {
    title: "薪資",
    items: [
      { to: "/salary/me", label: "我的薪資", icon: Wallet },
      { to: "/admin/salary", label: "薪資查詢", icon: Wallet },
    ],
  },
];

// ADMIN：依功能分區（核心作業／物流與派遣／回報與審核／人事行政／薪資／系統設定）
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
      { to: "/admin/dispatch", label: "派遣紀錄", icon: Route },
      { to: "/admin/vehicles", label: "車輛管理", icon: Truck },
      { to: "/repair-review", label: "維修管理", icon: Wrench },
    ],
  },
  {
    title: "回報與審核",
    items: [
      { to: "/fuel-report", label: "加油回報", icon: Fuel },
      { to: "/fuel-review", label: "油資審核", icon: Fuel },
      { to: "/parking-fee-report", label: "停車費回報", icon: ParkingSquare },
      { to: "/parking-fee-review", label: "停車費審核", icon: ParkingSquare },
      { to: "/repair-report", label: "車輛報修", icon: Wrench },
    ],
  },
  {
    title: "人事行政",
    items: [
      { to: "/admin/employees", label: "員工管理", icon: Users },
      { to: "/admin/performance", label: "員工績效統計", icon: TrendingUp },
      { to: "/regions", label: "區域管理", icon: MapPin },
      { to: "/schedule", label: "排班管理", icon: CalendarClock },
      { to: "/leaves", label: "請假申請", icon: CalendarCheck },
      { to: "/admin/leaves", label: "請假管理", icon: Scale },
    ],
  },
  {
    title: "薪資",
    items: [
      { to: "/admin/salary", label: "薪資計算", icon: Wallet },
      { to: "/admin/pay-grades", label: "職等薪資設定", icon: SlidersHorizontal },
    ],
  },
  {
    title: "記帳",
    items: [
      { to: "/admin/finance", label: "記帳", icon: NotebookPen },
      { to: "/admin/finance/report", label: "帳務月報", icon: PieChart },
      { to: "/admin/finance/import", label: "帶入中心", icon: Import },
      { to: "/admin/finance/settings", label: "帳務設定", icon: SlidersHorizontal },
    ],
  },
  {
    title: "系統設定",
    items: [{ to: "/admin/settings", label: "系統設定", icon: Settings }],
  },
];

// 職務權限對應的額外側邊欄項目（員工被指派含模組權限的職務時顯示）
const capabilityNavItems: { capability: Capability; items: NavItem[] }[] = [
  {
    capability: "MANAGE_VEHICLES",
    items: [
      { to: "/admin/vehicles", label: "車輛管理", icon: Truck },
      { to: "/repair-review", label: "維修管理", icon: Wrench },
    ],
  },
  {
    capability: "MANAGE_SCHEDULE",
    items: [{ to: "/schedule", label: "排班管理", icon: CalendarClock }],
  },
  {
    capability: "MANAGE_FINANCE",
    items: [
      { to: "/admin/finance", label: "記帳", icon: NotebookPen },
      { to: "/admin/finance/report", label: "帳務月報", icon: PieChart },
    ],
  },
];

// 區域主管旗標對應的額外側邊欄項目（user.isRegionManager 為真時顯示，與角色高低無關，見 User.isRegionManager）
const regionManagerNavItems: NavItem[] = [
  { to: "/my-region", label: "我的區域", icon: MapPin },
  { to: "/fuel-review", label: "油資審核", icon: Fuel },
  { to: "/parking-fee-review", label: "停車費審核", icon: ParkingSquare },
  { to: "/schedule", label: "排班管理", icon: CalendarClock },
];

const roleLabels: Record<string, string> = {
  ADMIN: "董事長",
  MANAGER: "執行長",
  EMPLOYEE: "員工",
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  let sections: NavSection[];
  if (user?.role === "ADMIN") {
    sections = adminNavSections;
  } else {
    // 非 ADMIN 一律先套角色固定選單，再依職務權限／區域主管旗標追加項目
    //（排除角色選單已有的路徑，例如執行長本來就有車輛管理／排班管理）
    sections = user?.role === "MANAGER" ? managerNavSections : employeeNavSections;
    const existingPaths = new Set(sections.flatMap((s) => s.items.map((i) => i.to)));

    const caps = user?.capabilities ?? [];
    const capItems = capabilityNavItems
      .filter((c) => caps.includes(c.capability))
      .flatMap((c) => c.items)
      .filter((i) => !existingPaths.has(i.to));
    if (capItems.length > 0) {
      // 以職務名稱作為區塊標題（例：車輛管理組長），比「授權模組」自然；可能同時有多個職務，逐一列出
      const jobPositionNames = (user?.jobPositions ?? []).map((jp) => jp.name).join("、");
      sections = [...sections, { title: jobPositionNames || "職務作業", items: capItems }];
      capItems.forEach((i) => existingPaths.add(i.to));
    }

    if (user?.isRegionManager) {
      const regionItems = regionManagerNavItems.filter((i) => !existingPaths.has(i.to));
      if (regionItems.length > 0) {
        sections = [...sections, { title: "區域主管", items: regionItems }];
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      {/* 行動裝置頂部列 */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="旭寺物流" className="h-9 w-9 rounded-lg" />
          <span className="text-lg font-bold text-gray-800">旭寺物流</span>
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
        >
          選單
        </button>
      </header>

      {/* 側邊欄 */}
      <nav
        className={`${menuOpen ? "flex flex-col" : "hidden"} border-b border-gray-200 bg-white md:flex md:w-60 md:flex-shrink-0 md:flex-col md:border-b-0 md:border-r md:shadow-[1px_0_0_0_rgba(0,0,0,0.02)]`}
      >
        <div className="hidden px-4 py-5 md:block">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="旭寺物流" className="h-9 w-9 rounded-lg" />
            <span className="text-lg font-bold tracking-tight text-gray-800">旭寺物流</span>
          </Link>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {sections.map((section, idx) => (
            <div key={idx} className={idx > 0 ? "mt-4 border-t border-gray-100 pt-4" : ""}>
              {section.title && (
                <p className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
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
                          `flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
        <div className="border-t border-gray-100 px-3 py-3">
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
            <CircleUserRound className="h-9 w-9 flex-shrink-0 text-gray-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800">{user?.name}</p>
              <p className="text-xs text-gray-400">{roleLabels[user?.role ?? ""] ?? user?.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
          <p className="mt-2 text-center font-mono text-[11px] text-gray-300">v{APP_VERSION}</p>
        </div>
      </nav>

      {/* 主內容 */}
      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
