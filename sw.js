/* 来場者カウンター オフライン用サービスワーカー
   一度オンラインで開くと、ページ・AIモデル・部品をすべて端末内に保存する。
   以後はネットが無くても、再読み込み・再起動しても起動できる。 */
// v2 (2026-09-27): 連れ・抱っこ対策。AIモデル・部品もインストール時に先に保存する。
// キャッシュ名は変えない（古い保存分を消さず、上書きで新しくする）
const CACHE = "vc-cache-v1";
const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const PRECACHE = ["./", "./index.html", "./overhead.html", "./manifest.webmanifest", "./icon.png",
  MP, MP + "/wasm/vision_wasm_internal.js", MP + "/wasm/vision_wasm_internal.wasm",
  MP + "/wasm/vision_wasm_nosimd_internal.js", MP + "/wasm/vision_wasm_nosimd_internal.wasm",
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite",
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 取れなかったもの（オフライン等）は、今ある保存分をそのまま使う
      .then((c) => Promise.allSettled(PRECACHE.map((u) => fetch(u, { cache: "reload" }).then((r) => { if (r && r.ok) return c.put(u, r); }))))
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
      const pose = ks.some((r) => r.url.includes("pose_landmarker"));
      e.source && e.source.postMessage({ type: "vc-cache-status", count: ks.length, pose });
    });
  }
});
