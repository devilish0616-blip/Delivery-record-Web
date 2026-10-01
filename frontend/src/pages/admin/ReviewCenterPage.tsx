import { ClipboardCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { TabbedPage, type PageTab } from "../../components/TabbedPage";
import { ExpenseReviewPanel } from "../../components/expense/ExpenseReviewPanel";
import { LeaveReviewPanel } from "../../components/requests/LeaveReviewPanel";
import { PendingOverview } from "../../components/requests/PendingOverview";
import { RepairReviewPanel } from "../../components/requests/RepairReviewPanel";
import { notifyReviewChanged, totalPending, useReviewSummary } from "../../utils/reviewSummary";

// 審核中心：油資、停車費、請假、報修集中在一頁。
// 董事長／執行長看得到全部分頁；只有「車輛管理」職務權限的員工只看到報修分頁
export function ReviewCenterPage() {
  const { user } = useAuth();
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";
  const canRepair = isManager || !!user?.capabilities?.includes("MANAGE_VEHICLES");
  const summary = useReviewSummary(isManager || canRepair);
  const [params, setParams] = useSearchParams();

  function goTab(key: string) {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  }

  const tabs: PageTab[] = [];
  if (isManager) {
    tabs.push(
      {
        key: "all",
        label: "全部待處理",
        badge: totalPending(summary),
        render: () =>
          summary ? <PendingOverview summary={summary} onChanged={notifyReviewChanged} goTab={goTab} /> : null,
      },
      { key: "fuel", label: "油資", badge: summary?.fuel, render: () => <ExpenseReviewPanel kind="fuel" onChanged={notifyReviewChanged} /> },
      {
        key: "parking",
        label: "停車費",
        badge: summary?.parking,
        render: () => <ExpenseReviewPanel kind="parking" onChanged={notifyReviewChanged} />,
      },
      { key: "leave", label: "請假", badge: summary?.leave, render: () => <LeaveReviewPanel onChanged={notifyReviewChanged} /> }
    );
  }
  if (canRepair) {
    tabs.push({ key: "repair", label: "報修", badge: summary?.repair, render: () => <RepairReviewPanel onChanged={notifyReviewChanged} /> });
  }

  return (
    <TabbedPage
      title="審核中心"
      icon={ClipboardCheck}
      description={isManager ? "油資、停車費、請假與車輛報修都在這裡處理，分頁上的數字是待處理件數。" : "處理員工回報的車輛故障。"}
      tabs={tabs}
    />
  );
}
