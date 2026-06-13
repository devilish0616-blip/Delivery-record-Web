import { useEffect, useState, type FormEvent } from "react";
import { apiClient, downloadFile, getErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { BatchImportResult, DeliveryRecord } from "../../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DailyDeliveryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [date, setDate] = useState(today());
  const [forwardCount, setForwardCount] = useState("");
  const [reverseCount, setReverseCount] = useState("");
  const [note, setNote] = useState("");
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function loadRecords() {
    setLoading(true);
    try {
      const { data } = await apiClient.get<DeliveryRecord[]>("/deliveries");
      setRecords(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await apiClient.post("/deliveries", {
        date,
        forwardCount: Number(forwardCount || 0),
        reverseCount: Number(reverseCount || 0),
        note: note || null,
      });
      setMessage("已儲存");
      setNote("");
      await loadRecords();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">每日送件記錄</h1>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            批次匯入
          </button>
        )}
      </div>

      {showImport && (
        <BatchImportModal
          onClose={() => setShowImport(false)}
          onImported={loadRecords}
        />
      )}

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">正物流件數</label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={forwardCount}
            onChange={(e) => setForwardCount(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="0"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">逆物流件數</label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={reverseCount}
            onChange={(e) => setReverseCount(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="0"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">備註（選填）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="異常或說明..."
          />
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {message && <p className="text-sm text-green-600 sm:col-span-2">{message}</p>}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "儲存中..." : "送出"}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          歷史紀錄
        </h2>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">載入中...</p>
        ) : records.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">尚無紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">日期</th>
                  <th className="px-4 py-2">正物流</th>
                  <th className="px-4 py-2">逆物流</th>
                  <th className="px-4 py-2">備註</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{r.date.slice(0, 10)}</td>
                    <td className="px-4 py-2">{r.forwardCount}</td>
                    <td className="px-4 py-2">{r.reverseCount}</td>
                    <td className="px-4 py-2 text-gray-500">{r.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BatchImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BatchImportResult | null>(null);
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function handleTemplateDownload() {
    try {
      await downloadFile("/delivery/batch-import/template", "送貨紀錄匯入範本.xlsx");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function runImport(dryRun: boolean) {
    if (!file) {
      setError("請選擇要上傳的 Excel 檔案");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("dryRun", String(dryRun));
      const { data } = await apiClient.post<BatchImportResult>("/delivery/batch-import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (dryRun) {
        setPreview(data);
      } else {
        setResult(data);
        setPreview(null);
        onImported();
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg">
        <h3 className="text-base font-semibold text-gray-800">批次匯入送貨紀錄</h3>

        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={handleTemplateDownload}
            className="text-sm text-blue-600 hover:underline"
          >
            下載 Excel 範本
          </button>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">上傳 Excel 檔案</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {preview && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
              <p>解析出 {preview.totalRows} 筆資料</p>
              {preview.dateRange && (
                <p>
                  日期範圍：{preview.dateRange.from} ～ {preview.dateRange.to}
                </p>
              )}
              {preview.employees.length > 0 && <p>員工：{preview.employees.join("、")}</p>}
              <p>
                可匯入 {preview.successCount} 筆，失敗 {preview.failureCount} 筆
              </p>
              {preview.failures.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-red-600">
                  {preview.failures.map((f, i) => (
                    <li key={i}>
                      第 {f.row} 列：{f.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <p>
                匯入完成，成功 {result.successCount} 筆，失敗 {result.failureCount} 筆
              </p>
              {result.failures.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-red-600">
                  {result.failures.map((f, i) => (
                    <li key={i}>
                      第 {f.row} 列：{f.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            關閉
          </button>
          <button
            type="button"
            disabled={loading || !file}
            onClick={() => runImport(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          >
            {loading ? "處理中..." : "預覽"}
          </button>
          <button
            type="button"
            disabled={loading || !preview || preview.successCount === 0}
            onClick={() => runImport(false)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "處理中..." : "確認匯入"}
          </button>
        </div>
      </div>
    </div>
  );
}
