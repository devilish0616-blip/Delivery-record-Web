import { Wallet } from "lucide-react";
import { TabbedPage } from "../../components/TabbedPage";
import { SalaryPage } from "../admin/SalaryPage";
import { PayGradesPage } from "../admin/PayGradesPage";
import { MySalaryPage } from "../employee/MySalaryPage";

// 薪資：算薪、預覽員工看到的畫面、調整職等公式是同一件事的三個步驟，收成一頁
export function SalaryHubPage() {
  return (
    <TabbedPage
      title="薪資"
      icon={Wallet}
      tabs={[
        { key: "calc", label: "薪資計算", render: () => <SalaryPage embedded /> },
        { key: "preview", label: "員工薪資畫面", render: () => <MySalaryPage embedded /> },
        { key: "grades", label: "職等設定", render: () => <PayGradesPage embedded /> },
      ]}
    />
  );
}
