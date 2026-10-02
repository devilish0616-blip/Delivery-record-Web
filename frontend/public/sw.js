// 旭寺物流 Service Worker：讓系統可以「加到主畫面」並秒開。
// 規則刻意保守：
//  - 只處理同網域的 GET；API（/api/ 或其他網域的後端）一律不碰，資料永遠即時
//  - 頁面（導覽）先抓網路，離線時才用上次的頁面
//  - /assets/ 下的檔名帶雜湊、內容不會變，可以放心快取
// 要停用時：把這支換成只有 self.registration.unregister() 的版本即可
const CACHE = "xusi-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(CACHE);
            await cache.put("/index.html", res.clone());
          }
          return res;
        } catch (err) {
          const cached = await caches.match("/index.html");
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(req, res.clone());
        }
        return res;
      })()
    );
  }
});
