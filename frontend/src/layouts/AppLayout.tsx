import { useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { APP_VERSION } from "../version";
import {
  ClipboardCheck,
  CircleUserRound,
  ClipboardList,
  Home,
  Landmark,
  Import,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  PieChart,
  Settings,
  Truck,
  Users,
  Wallet,
  Send,
  type LucideProps,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import type { Capability } from "../api/types";
import { totalPending, useReviewSummary } from "../utils/reviewSummary";

type IconType = ComponentType<LucideProps>;

interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  // 顯示待處理件數徽章（目前只有審核中心）
  badge?: "review";
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

// 側邊欄依「誰要做什麼事」分組：每天要做的（填報、申請）、主管要處理的（審核、營運）、管理、記帳、系統。
// 同一件事的不同面向放在同一頁的分頁裡（見各整合頁），側邊欄只放入口。

// EMPLOYEE：每天要做的事＋自己的薪資
const employeeNavSections: NavSection[] = [
  {
    title: "每天",
    items: [
      { to: "/", label: "首頁", icon: Home },
      { to: "/delivery", label: "每日填報", icon: ClipboardList },
      { to: "/requests", label: "我的申請", icon: Send },
      { to: "/salary/me", label: "我的薪資", icon: Wallet },
    ],
  },
];

// MANAGER：與 ADMIN 同一套分組，少了記帳與系統設定，多了自己的薪資
const managerNavSections: NavSection[] = [
  {
    title: "每天",
    items: [
      { to: "/", label: "首頁", icon: Home },
      { to: "/delivery", label: "每日填報", icon: ClipboardList },
      { to: "/requests", label: "我的申請", icon: Send },
      { to: "/salary/me", label: "我的薪資", icon: Wallet },
    ],
  },
  {
    title: "主管",
    items: [
      { to: "/review", label: "審核中心", icon: ClipboardCheck, badge: "review" },
      { to: "/admin", label: "營運總覽", icon: LayoutDashboard },
    ],
  },
  {
    title: "管理",
    items: [
      { to: "/admin/employees", label: "員工", icon: Users },
      { to: "/admin/vehicles", label: "車輛", icon: Truck },
      { to: "/admin/assets", label: "資產", icon: Landmark },
      { to: "/admin/salary", label: "薪資", icon: Wallet },
    ],
  },
];

// ADMIN
const adminNavSections: NavSection[] = [
  {
    title: "每天",
    items: [
      { to: "/", label: "首頁", icon: Home },
      { to: "/delivery", label: "每日填報", icon: ClipboardList },
      { to: "/requests", label: "我的申請", icon: Send },
    ],
  },
  {
    title: "主管",
    items: [
      { to: "/review", label: "審核中心", icon: ClipboardCheck, badge: "review" },
      { to: "/admin", label: "營運總覽", icon: LayoutDashboard },
    ],
  },
  {
    title: "管理",
    items: [
      { to: "/admin/employees", label: "員工", icon: Users },
      { to: "/admin/vehicles", label: "車輛", icon: Truck },
      { to: "/admin/assets", label: "資產", icon: Landmark },
      { to: "/admin/salary", label: "薪資", icon: Wallet },
    ],
  },
  {
    title: "記帳",
    items: [
      { to: "/admin/finance", label: "記帳", icon: NotebookPen },
      { to: "/admin/finance/report", label: "帳務月報", icon: PieChart },
      { to: "/admin/finance/import", label: "帶入中心", icon: Import },
    ],
  },
  {
    title: "系統",
    items: [{ to: "/admin/settings", label: "系統設定", icon: Settings }],
  },
];

// 職務權限對應的額外側邊欄項目（員工被指派含模組權限的職務時顯示）
const capabilityNavItems: { capability: Capability; items: NavItem[] }[] = [
  {
    capability: "MANAGE_VEHICLES",
    items: [
      { to: "/admin/vehicles", label: "車輛", icon: Truck },
      { to: "/review", label: "審核中心", icon: ClipboardCheck, badge: "review" },
    ],
  },
  {
    capability: "MANAGE_FINANCE",
    items: [
      { to: "/admin/finance", label: "記帳", icon: NotebookPen },
      { to: "/admin/finance/report", label: "帳務月報", icon: PieChart },
    ],
  },
];

// 手機底部固定的四顆大按鈕：依身分放每天最常用的四件事，其他功能在右上角「選單」
function bottomNavItems(role: string | undefined): NavItem[] {
  if (role === "ADMIN") {
    return [
      { to: "/", label: "首頁", icon: Home },
      { to: "/review", label: "審核", icon: ClipboardCheck, badge: "review" },
      { to: "/admin", label: "營運", icon: LayoutDashboard },
      { to: "/admin/finance", label: "記帳", icon: NotebookPen },
    ];
  }
  if (role === "MANAGER") {
    return [
      { to: "/", label: "首頁", icon: Home },
      { to: "/delivery", label: "收工", icon: ClipboardList },
      { to: "/review", label: "審核", icon: ClipboardCheck, badge: "review" },
      { to: "/admin", label: "營運", icon: LayoutDashboard },
    ];
  }
  return [
    { to: "/", label: "首頁", icon: Home },
    { to: "/delivery", label: "收工", icon: ClipboardList },
    { to: "/requests", label: "申請", icon: Send },
    { to: "/salary/me", label: "薪資", icon: Wallet },
  ];
}

const roleLabels: Record<string, string> = {
  ADMIN: "董事長",
  MANAGER: "執行長",
  EMPLOYEE: "員工",
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const canReview =
    user?.role === "ADMIN" || user?.role === "MANAGER" || !!user?.capabilities?.includes("MANAGE_VEHICLES");
  const reviewPending = totalPending(useReviewSummary(canReview, pathname));

  let sections: NavSection[];
  if (user?.role === "ADMIN") {
    sections = adminNavSections;
  } else {
    // 非 ADMIN 一律先套角色固定選單，再依職務權限追加項目
    //（排除角色選單已有的路徑，例如執行長本來就有車輛管理）
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
                        {item.badge === "review" && reviewPending > 0 && (
                          <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-5 text-white">
                            {reviewPending}
                          </span>
                        )}
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

      {/* 主內容（手機底部留出導覽列的高度） */}
      <main className="flex-1 p-4 pb-24 md:p-6">
        <Outlet />
      </main>

      {/* 手機底部導覽列 */}
      <nav
        aria-label="常用功能"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-4">
          {bottomNavItems(user?.role).map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                      isActive ? "text-blue-600" : "text-gray-500"
                    }`
                  }
                >
                  <Icon className="h-6 w-6" />
                  {item.label}
                  {item.badge === "review" && reviewPending > 0 && (
                    <span className="absolute right-[calc(50%-1.4rem)] top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white">
                      {reviewPending}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
