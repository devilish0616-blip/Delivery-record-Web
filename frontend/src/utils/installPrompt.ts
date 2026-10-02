// 「加到主畫面」（PWA）：
//  - Chrome／Edge（Android、電腦）會發 beforeinstallprompt，先攔下來，等使用者按按鈕才跳安裝視窗
//  - iPhone Safari 沒有這個事件，只能教使用者從分享選單「加入主畫面」
//  - LINE、Facebook 等 App 內建瀏覽器不能安裝，要請使用者改用 Safari／Chrome 開啟

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

// 在 main.tsx 呼叫一次：攔安裝事件、正式環境註冊 Service Worker
export function initInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 註冊失敗不影響使用，只是不能安裝
      });
    });
  }
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === "accepted";
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type InstallMode = "prompt" | "ios" | "in-app" | null;

// 目前這支手機能怎麼安裝；電腦（滑鼠操作）不顯示
export function installMode(): InstallMode {
  if (isStandalone()) return null;
  if (!window.matchMedia("(pointer: coarse)").matches) return null;
  const ua = navigator.userAgent;
  if (/\bLine\/|FBAN|FBAV|Instagram/i.test(ua)) return "in-app";
  if (canPromptInstall()) return "prompt";
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) return "ios";
  return null;
}
