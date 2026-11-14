const CACHE = "moneyipon-v3";
const SHELL = ["./", "index.html", "style.css", "script.js", "manifest.json", "assets/icon-192.png", "assets/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Fast loading: answer from cache right away, refresh the cache in the background.
// (After you publish an update, reload twice to see it.) Auth and database calls pass through.
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  const ok = u.origin === location.origin || ["www.gstatic.com", "fonts.gstatic.com", "fonts.googleapis.com"].includes(u.hostname);
  if (r.method !== "GET" || !ok) return;
  e.respondWith(caches.open(CACHE).then(cache => cache.match(r).then(hit => {
    const net = fetch(r).then(res => { if (res.ok) cache.put(r, res.clone()); return res; });
    return hit || net.catch(() => cache.match("index.html"));
  })));
});