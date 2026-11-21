// Network-first service worker: always fresh when online, cached copy when offline.
const CACHE = 'ember-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // app files + the speech engine/model (large, cache once)
  const isModel = /vosk/.test(url.href);
  if (url.origin !== location.origin && !isModel) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isModel) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: !isModel });
      return hit || Response.error();
    }
  })());
});
