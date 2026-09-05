/* 来場者カウンター オフライン用サービスワーカー
   一度オンラインで開くと、ページ・AIモデル・部品をすべて端末内に保存する。
   以後はネットが無くても、再読み込み・再起動しても起動できる。 */
const CACHE = "vc-cache-v1";
const PRECACHE = ["./", "./index.html", "./overhead.html", "./manifest.webmanifest", "./icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// キャッシュ優先。オンラインのときは裏で最新版に更新する。
// 初回に取得したもの（MediaPipeのJS・wasm・AIモデル）も自動的に保存される。
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                       // GASへの送信(POST)は素通し
  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: false }) || await cache.match(req, { ignoreSearch: true });
    if (hit) {
      // 裏で更新（失敗しても無視＝オフラインでも問題なし）
      fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      // オフラインで未保存のものを求められたとき（通常は起きない）
      const fallback = await cache.match("./index.html");
      if (req.mode === "navigate" && fallback) return fallback;
      throw err;
    }
  })());
});

// ページから「今キャッシュできているか」を問い合わせる用
self.addEventListener("message", (e) => {
  if (e.data === "vc-cache-status") {
    caches.open(CACHE).then((c) => c.keys()).then((ks) => {
      e.source && e.source.postMessage({ type: "vc-cache-status", count: ks.length });
    });
  }
});
