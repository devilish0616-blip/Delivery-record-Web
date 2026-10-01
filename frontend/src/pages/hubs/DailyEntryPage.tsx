import { ClipboardList } from "lucide-react";
import { TabbedPage } from "../../components/TabbedPage";
import { DailyDeliveryPage } from "../employee/DailyDeliveryPage";
import { MileagePage } from "../employee/MileagePage";

// 每日填報：員工每天收工要填的送件與車輛里程放在同一頁
export function DailyEntryPage() {
  return (
    <TabbedPage
      title="每日填報"
      icon={ClipboardList}
      tabs={[
        { key: "delivery", label: "送件", render: () => <DailyDeliveryPage embedded /> },
        { key: "mileage", label: "車輛里程", render: () => <MileagePage embedded /> },
      ]}
    />
  );
}
