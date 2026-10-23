/* Funky Orbit web app: works offline in a sports hall without (good) wifi, on every page.
   Pages and data.json come from the network when possible, otherwise the last copy we got.
   Scripts, styles and fonts come from the cache first. The cache name is set by tools/release.py. */
const VERSION = "fo-site-1.7.1-9351bc";
const PAGES = ["/", "/stats/", "/patterns/", "/gen/", "/changes/", "/request/"];
const FILES = [
  ...PAGES,
  "/app.js?v=1.7.1-9351bc",
  "/stats/stats.js?v=1.7.1-9351bc",
  "/patterns/patterns.js?v=1.7.1-9351bc",
  "/gen/gen.js?v=1.7.1-9351bc",
  "/changes/changes.js?v=1.7.1-9351bc",
  "/request/request.js?v=1.7.1-9351bc",
  "/shared.js?v=1.7.1-9351bc",
  "/style.css?v=1.7.1-9351bc",
  "/favicon.svg?v=1.7.1-9351bc",
  "/manifest.webmanifest",
  "/changelog.json",
  "/icons/icon-192.png?v=2",
  "/icons/icon-512.png?v=2",
  "/icons/apple-touch-icon.png?v=2",
  "/data.json",
];
// Fonts are the only files from elsewhere we keep; videos, thumbnails and the like API always go to the network.
const FONTS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys() // also the old generator-only caches (fo-gen-...)
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fo-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  if (own && url.pathname.startsWith("/api/")) return;

  // pages, data.json and the changelog: newest from the network, the last copy when offline
  if (own && (req.mode === "navigate" || url.pathname === "/data.json" || url.pathname === "/changelog.json")) {
    const key = url.pathname; // without ?query, so one copy per page
    ev.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(key, copy));
        }
        return res;
      }).catch(() => caches.match(key).then((hit) => hit || caches.match("/gen/")))
    );
    return;
  }

  // scripts, styles, icons and fonts: cache first, and remember what we fetch
  if (!own && !FONTS.includes(url.origin)) return;
  ev.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
