import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import type { ReviewSummary } from "../components/requests/PendingOverview";

const EVENT = "review-summary-changed";

// 審核中心頁內做完核准／駁回後呼叫，側邊欄徽章與分頁徽章會一起重新整理
export function notifyReviewChanged() {
  window.dispatchEvent(new Event(EVENT));
}

// 審核中心各類待處理件數；enabled 為 false（沒有任何審核權限）時不發請求
export function useReviewSummary(enabled: boolean, refreshKey?: string) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return;
    apiClient
      .get<ReviewSummary>("/review/summary")
      .then(({ data }) => setSummary(data))
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    window.addEventListener(EVENT, refresh);
    return () => window.removeEventListener(EVENT, refresh);
  }, [refresh]);

  return summary;
}

export function totalPending(s: ReviewSummary | null): number {
  if (!s) return 0;
  return (s.fuel ?? 0) + (s.parking ?? 0) + (s.leave ?? 0) + (s.repair ?? 0);
}
