import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "lazy-page-reloaded-at";

// 頁面用到才下載。部署新版後，還開著舊畫面的手機會找不到舊版的頁面檔案，
// 這時自動重新整理一次換成新版（一分鐘內最多一次，避免網路斷線時一直重整）
export function lazyPage<P extends object>(loader: () => Promise<ComponentType<P>>) {
  return lazy(async () => {
    try {
      return { default: await loader() };
    } catch (err) {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      } catch {
        /* 無法使用 sessionStorage 時不自動重整 */
      }
      if (Date.now() - last > 60_000) {
        try {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
        } catch {
          /* 無法記錄就不重整，交給錯誤畫面 */
        }
      }
      throw err;
    }
  });
}
