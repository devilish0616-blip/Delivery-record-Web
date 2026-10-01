import { Users } from "lucide-react";
import { TabbedPage } from "../../components/TabbedPage";
import { EmployeesPage } from "../admin/EmployeesPage";
import { EmployeePerformancePage } from "../admin/EmployeePerformancePage";

// 員工：原員工管理（員工資料、職務加給設定）與員工績效統計收成一頁；個別員工的歷史紀錄仍從員工資料面板進入
export function StaffPage() {
  return (
    <TabbedPage
      title="員工"
      icon={Users}
      description="帳號、角色、職等、職務與權限集中管理"
      tabs={[
        { key: "profile", label: "員工資料", render: () => <EmployeesPage view="profile" /> },
        { key: "position", label: "職務與加給", render: () => <EmployeesPage view="position" /> },
        { key: "performance", label: "績效統計", render: () => <EmployeePerformancePage embedded /> },
      ]}
    />
  );
}
