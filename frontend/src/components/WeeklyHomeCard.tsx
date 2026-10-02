import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { apiClient } from "../api/client";
import type { WeeklyReport } from "../api/types";

function md(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

function change(cur: number, prev: number) {
  if (prev === 0 || cur === prev) return "";
  const pct = Math.round((Math.abs(cur - prev) / prev) * 100);
  return `（${cur > prev ? "▲" : "▼"}${pct}%）`;
}

// 首頁「上週週報」摘要（董事長／執行長）：件數、預估營收跟前一週比，點進去看完整週報
export function WeeklyHomeCard() {
  const [report, setReport] = useState<WeeklyReport | null>(null);

  useEffect(() => {
    apiClient
      .get<WeeklyReport>("/reports/weekly")
      .then(({ data }) => setReport(data))
      .catch(() => setReport(null));
  }, []);

  if (!report) return null;
  const { totals, prev } = report;

  return (
    <Link
      to="/admin?tab=weekly"
      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm hover:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">
          上週週報 <span className="font-normal text-gray-500">{md(report.start)}～{md(report.end)}</span>
        </p>
        <p className="mt-0.5 text-sm text-gray-600">
          件數 <span className="font-mono">{totals.total.toLocaleString()}</span>
          {change(totals.total, prev.total)}
          {totals.revenue !== null && (
            <>
              ・預估營收 <span className="font-mono">${totals.revenue.toLocaleString()}</span>
              {prev.revenue !== null && change(totals.revenue, prev.revenue)}
            </>
          )}
          {report.anomalies ? `・${report.anomalies} 筆資料要確認` : ""}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
    </Link>
  );
}
