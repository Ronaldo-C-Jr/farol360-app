// FAROL360 — Service Worker (PWA). Estratégia: network-first para GET; nunca toca nas rotas /api/.
const CACHE = 'farol360-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;                 // POST/API passam direto
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // recursos externos: rede
  if (url.pathname.indexOf('/api/') === 0) return;  // nunca cachear a API

  e.respondWith(
    fetch(req).then(function (res) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) { return m || caches.match('/'); });
    })
  );
});