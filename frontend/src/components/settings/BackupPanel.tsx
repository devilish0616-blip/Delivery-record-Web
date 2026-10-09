import { useEffect, useState } from "react";
import { DatabaseBackup, Download } from "lucide-react";
import { apiClient, downloadFile, getErrorMessage } from "../../api/client";
import { localToday } from "../../utils/date";

interface BackupStatus {
  lastBackupAt: string | null;
  lastBackupByName: string | null;
}

// 系統設定「資料備份」：一鍵下載全部資料（JSON），建議每週一次存到雲端硬碟；超過 7 天首頁會提醒
export function BackupPanel() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  // 載入狀態的時間，用來算「已經幾天沒備份」
  const [checkedAt, setCheckedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get<BackupStatus>("/backup/status")
      .then(({ data }) => {
        if (!active) return;
        setStatus(data);
        setCheckedAt(Date.now());
      })
      .catch((err) => active && setError(getErrorMessage(err)));
    return () => {
      active = false;
    };
  }, []);

  async function download() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await downloadFile("/backup/export", `旭寺物流備份_${localToday()}.json`);
      const { data } = await apiClient.get<BackupStatus>("/backup/status");
      setStatus(data);
      setCheckedAt(Date.now());
      setMessage("已下載。請把檔案存到雲端硬碟（例如 Google 雲端硬碟的「九日物流／備份」資料夾）。");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const last = status?.lastBackupAt ? new Date(status.lastBackupAt) : null;
  const days = last ? Math.floor((checkedAt - last.getTime()) / 86400000) : null;

  return (
    <div className="max-w-2xl space-y-4">
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
          <DatabaseBackup className="h-5 w-5 text-gray-500" />
          下載全部資料
        </h2>
        <p className="text-sm leading-relaxed text-gray-600">
          把系統裡所有資料（送件、里程、薪資與封存快照、記帳、車輛、資產、請假與報帳、操作紀錄…）下載成一個檔案。
          正式站的資料庫如果出問題，可以用這個檔案還原。建議每週下載一次，存到雲端硬碟。
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-gray-500">
          <li>檔案裡有全部員工與帳務資料，請存在只有自己看得到的地方，不要傳到群組。</li>
          <li>為了安全，檔案不含員工密碼；萬一要用備份還原，大家的密碼要重新設定。</li>
          <li>還原要請開發者處理（程式在 backend/scripts/restoreBackup.ts）。</li>
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {busy ? "準備中..." : "下載全部資料"}
          </button>
          <span className={`text-sm ${days === null || days >= 7 ? "text-amber-700" : "text-gray-500"}`}>
            {last
              ? `上次備份：${last.toLocaleString("zh-TW", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}${
                  status?.lastBackupByName ? `（${status.lastBackupByName}）` : ""
                }${days !== null && days >= 7 ? `，已經 ${days} 天` : ""}`
              : "還沒有下載過備份"}
          </span>
        </div>
        {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
      <p className="text-xs text-gray-400">另外也可以在 Railway 的資料庫設定確認有沒有開啟自動備份（依方案而定）。</p>
    </div>
  );
}
