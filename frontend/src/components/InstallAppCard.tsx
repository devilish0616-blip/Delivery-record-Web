import { useEffect, useState } from "react";
import { Share, Smartphone, X } from "lucide-react";
import { installMode, promptInstall, subscribeInstall, type InstallMode } from "../utils/installPrompt";

const DISMISS_KEY = "install-card-dismissed-at";
const DISMISS_DAYS = 30;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

// 首頁「加到主畫面」提示：手機上還沒安裝時顯示，按「不用了」30 天內不再出現
export function InstallAppCard() {
  const [mode, setMode] = useState<InstallMode>(() => (dismissedRecently() ? null : installMode()));
  const [hidden, setHidden] = useState(false);

  useEffect(() => subscribeInstall(() => setMode(dismissedRecently() ? null : installMode())), []);

  if (hidden || !mode) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // 無痕模式等存不了，就只關掉這一次
    }
    setHidden(true);
  }

  return (
    <section className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
      <Smartphone className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-700" />
      <div className="min-w-0 flex-1 space-y-2 text-sm text-blue-900">
        <p className="font-semibold">把旭寺物流加到手機主畫面</p>
        {mode === "prompt" && (
          <>
            <p className="text-blue-800">之後在桌面點圖示就能打開，不用再找網址。</p>
            <button
              type="button"
              onClick={async () => {
                await promptInstall();
                setMode(installMode());
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              加到主畫面
            </button>
          </>
        )}
        {mode === "ios" && (
          <p className="text-blue-800">
            點 Safari 下方的分享按鈕
            <Share className="mx-1 inline h-4 w-4 align-text-bottom" aria-label="分享" />
            ，往下滑選「加入主畫面」，之後在桌面點圖示就能打開。
          </p>
        )}
        {mode === "in-app" && (
          <p className="text-blue-800">
            在 LINE 或 Facebook 裡面打開的網頁沒辦法加到主畫面。請點右上角選單，選「用預設瀏覽器開啟」（Safari 或 Chrome），再從那邊加入。
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="不用了"
        className="rounded p-1 text-blue-700 hover:bg-blue-100"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
