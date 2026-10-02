import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { apiClient } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { DataChecks } from "../../api/types";
import { TabbedPage } from "../../components/TabbedPage";
import { DailyOperationsPanel } from "../../components/operations/DailyOperationsPanel";
import { DataChecksPanel } from "../../components/operations/DataChecksPanel";
import { ClosingPanel } from "../../components/operations/ClosingPanel";
import type { PageTab } from "../../components/TabbedPage";
import { DayPanel } from "../../components/operations/DayPanel";
import { OverviewPanel } from "../../components/operations/OverviewPanel";
import { VehicleStatusPanel } from "../../components/operations/VehicleStatusPanel";
import { WeeklyReportPanel } from "../../components/operations/WeeklyReportPanel";

// 營運總覽：原儀表板與只能從儀表板點進去的每日營運總表、員工送件狀況、車輛狀況，加上派遣紀錄，收成一頁分頁；
// 另有「週報」（一週與前一週比）與「資料檢查」（可能打錯的件數、里程、報帳）
export function OperationsPage() {
  const { user } = useAuth();
  const [checks, setChecks] = useState<DataChecks | null>(null);
  const [version, setVersion] = useState(0);
  const reloadChecks = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    apiClient
      .get<DataChecks>("/checks")
      .then(({ data }) => active && setChecks(data))
      .catch(() => active && setChecks({ from: "", to: "", items: [] }));
    return () => {
      active = false;
    };
  }, [version]);

  const openChecks = checks?.items.filter((i) => !i.dismissed).length ?? 0;

  const tabs: PageTab[] = [
    { key: "overview", label: "總覽", render: () => <OverviewPanel /> },
    { key: "weekly", label: "週報", render: () => <WeeklyReportPanel /> },
    { key: "daily", label: "每日營運", render: () => <DailyOperationsPanel /> },
    { key: "day", label: "送件與派車", render: () => <DayPanel /> },
    { key: "vehicles", label: "車輛狀況", render: () => <VehicleStatusPanel /> },
    {
      key: "checks",
      label: "資料檢查",
      badge: openChecks,
      render: () => <DataChecksPanel checks={checks} onChanged={reloadChecks} />,
    },
  ];
  // 月底結算含薪資封存與記帳，只有董事長看得到
  if (user?.role === "ADMIN") tabs.push({ key: "closing", label: "月底結算", render: () => <ClosingPanel /> });

  return <TabbedPage title="營運總覽" icon={LayoutDashboard} tabs={tabs} />;
}
