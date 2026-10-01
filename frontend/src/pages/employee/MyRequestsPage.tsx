import { Send } from "lucide-react";
import { TabbedPage } from "../../components/TabbedPage";
import { ExpenseReportPanel } from "../../components/expense/ExpenseReportPanel";
import { LeaveRequestPanel } from "../../components/requests/LeaveRequestPanel";
import { RepairReportPanel } from "../../components/requests/RepairReportPanel";

// 我的申請：所有「送出後等主管處理」的單子（加油、停車費、車輛報修、請假）集中一頁
export function MyRequestsPage() {
  return (
    <TabbedPage
      title="我的申請"
      icon={Send}
      description="加油、停車費核准後會計入當月薪資；報修與請假由主管處理後會更新狀態。"
      tabs={[
        { key: "fuel", label: "加油", render: () => <ExpenseReportPanel kind="fuel" /> },
        { key: "parking", label: "停車費", render: () => <ExpenseReportPanel kind="parking" /> },
        { key: "repair", label: "車輛報修", render: () => <RepairReportPanel /> },
        { key: "leave", label: "請假", render: () => <LeaveRequestPanel /> },
      ]}
    />
  );
}
