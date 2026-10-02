import { ClipboardList } from "lucide-react";
import { TabbedPage } from "../../components/TabbedPage";
import { DailyClosePanel } from "../../components/daily/DailyClosePanel";
import { DailyDeliveryPage } from "../employee/DailyDeliveryPage";
import { MileagePage } from "../employee/MileagePage";

// 每日填報：「今日收工」一張表填完當天的角色、件數、里程與加油；
// 「送件」「車輛里程」分頁保留歷史紀錄、代填送件與批次匯入
export function DailyEntryPage() {
  return (
    <TabbedPage
      title="每日填報"
      icon={ClipboardList}
      tabs={[
        { key: "today", label: "今日收工", render: () => <DailyClosePanel /> },
        { key: "delivery", label: "送件紀錄", render: () => <DailyDeliveryPage embedded /> },
        { key: "mileage", label: "里程紀錄", render: () => <MileagePage embedded /> },
      ]}
    />
  );
}
