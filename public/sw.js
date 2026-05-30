// Service worker: caches the app shell and any opened pages/covers so the
// reader works offline. Note: service workers only run in a secure context
// (https or localhost), so offline caching is active on the desktop and on a
// phone only if the server is reached over https.
const SHELL = "comic-shell-v12";
const MEDIA = "comic-media-v12";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "/vendor/jszip/jszip.min.js",
  "/vendor/epubjs/epub.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== MEDIA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Documents are served with Range (206) responses, which the Cache API can't
  // store — let them pass straight through to the network.
  if (/\/api\/doc\/[^/]+\/file/.test(url.pathname)) return;

  // Page images and covers (comics and rendered PDF pages alike): cache-first
  // in the long-lived MEDIA cache so opened pages survive app updates.
  if (/\/api\/(book|doc)\/[^/]+\/(page\/\d+|cover)/.test(url.pathname)) {
    e.respondWith(
      caches.open(MEDIA).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Catalog / info: network-first (stay fresh), fall back to cache offline.
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Shell assets and navigations: cache-first with background refresh.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
            return res;
          })
          .catch(() => (req.mode === "navigate" ? caches.match("./index.html") : undefined))
    )
  );
});
