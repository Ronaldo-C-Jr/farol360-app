// FAROL360 — Service Worker (PWA). network-first para GET; nunca toca em /api/.
// Bumpe este número a cada release (deve casar com APP_VER no index.html e a versão do package.json).
const CACHE = 'farol360-1.1.1';

self.addEventListener('install', function (e) { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    // Remove só versões antigas DESTE app; preserva caches de terceiros na mesma origem.
    await Promise.all(keys.filter(function (k) { return k.indexOf('farol360-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;                 // POST/API passam direto
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // recursos externos: rede
  if (url.pathname.indexOf('/api/') === 0) return;  // nunca cachear a API

  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  e.respondWith(
    fetch(req).then(function (res) {
      // Só cacheia respostas OK e da própria origem — nunca erros nem respostas opacas.
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) {
        if (m) return m;
        // Fallback para a home só em navegação — não devolve HTML para script/imagem/etc.
        return isNav ? caches.match('/') : Response.error();
      });
    })
  );
});