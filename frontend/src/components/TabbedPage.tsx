import type { ComponentType, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { LucideProps } from "lucide-react";

export interface PageTab {
  key: string;
  label: string;
  // 待處理件數徽章；0 或未提供則不顯示
  badge?: number | null;
  render: () => ReactNode;
}

// 多個功能整合成一頁時共用的外框：標題＋分頁列，目前分頁記在網址 ?tab=，
// 重新整理、轉址（例如舊的 /fuel-review → /review?tab=fuel）或分享連結都會停在同一個分頁
export function TabbedPage({
  title,
  icon: Icon,
  description,
  tabs,
  actions,
}: {
  title: string;
  icon?: ComponentType<LucideProps>;
  description?: ReactNode;
  tabs: PageTab[];
  actions?: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = tabs.find((t) => t.key === requested) ?? tabs[0];

  function select(key: string) {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-6 w-6 text-blue-600" />}
            <h1 className="text-xl font-semibold text-gray-800">{title}</h1>
          </div>
          {description && <p className="mt-0.5 text-xs text-gray-400">{description}</p>}
        </div>
        {actions}
      </div>

      {tabs.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div role="tablist" className="flex min-w-max gap-1 border-b border-gray-200">
            {tabs.map((t) => {
              const on = t.key === active?.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => select(t.key)}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    on ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t.label}
                  {!!t.badge && (
                    <span
                      className={`rounded-full px-1.5 text-[11px] font-bold leading-5 ${
                        on ? "bg-red-600 text-white" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {active && <div key={active.key}>{active.render()}</div>}
    </div>
  );
}
