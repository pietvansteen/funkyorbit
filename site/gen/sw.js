/* Funky Orbit generator: works offline in a sports hall without (good) wifi.
   The page and its files come from the cache; data.json from the network when possible,
   otherwise the last copy we got. Bump VERSION when the files below change. */
const VERSION = "fo-gen-1.1.2";
const FILES = [
  "/gen/",
  "/gen/gen.js?v=1.1.2",
  "/shared.js?v=1.1.2",
  "/style.css?v=1.1.2",
  "/favicon.svg?v=1.1.2",
  "/gen/manifest.webmanifest",
  "/icons/icon-192.png?v=2",
  "/icons/icon-512.png?v=2",
  "/icons/apple-touch-icon.png?v=2",
  "/data.json",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fo-gen-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // data.json and the page itself: newest from the network, the last copy when offline
  if (url.pathname === "/data.json" || (url.origin === location.origin && url.pathname === "/gen/")) {
    ev.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(url.pathname === "/data.json" ? "/data.json" : "/gen/", copy));
        }
        return res;
      }).catch(() => caches.match(url.pathname === "/data.json" ? "/data.json" : "/gen/"))
    );
    return;
  }

  // everything else (scripts, styles, fonts): cache first, and remember what we fetch
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
