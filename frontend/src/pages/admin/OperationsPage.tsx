import { LayoutDashboard } from "lucide-react";
import { TabbedPage } from "../../components/TabbedPage";
import { DailyOperationsPanel } from "../../components/operations/DailyOperationsPanel";
import { DayPanel } from "../../components/operations/DayPanel";
import { OverviewPanel } from "../../components/operations/OverviewPanel";
import { VehicleStatusPanel } from "../../components/operations/VehicleStatusPanel";

// 營運總覽：原儀表板與只能從儀表板點進去的每日營運總表、員工送件狀況、車輛狀況，加上派遣紀錄，收成一頁分頁
export function OperationsPage() {
  return (
    <TabbedPage
      title="營運總覽"
      icon={LayoutDashboard}
      tabs={[
        { key: "overview", label: "總覽", render: () => <OverviewPanel /> },
        { key: "daily", label: "每日營運", render: () => <DailyOperationsPanel /> },
        { key: "day", label: "送件與派車", render: () => <DayPanel /> },
        { key: "vehicles", label: "車輛狀況", render: () => <VehicleStatusPanel /> },
      ]}
    />
  );
}
