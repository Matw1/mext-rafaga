// MEXT Ráfaga — service worker: guarda la app en el teléfono para que funcione sin internet.
// Al publicar una versión nueva, sube el número de VERSION para que el teléfono la descargue.
const VERSION = 'mext-rafaga-v19';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const pagina = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  e.respondWith(caches.open(VERSION).then(async cache => {
    if (pagina) {
      // La app: primero la versión de internet (si responde en 4 s); sin conexión, la copia guardada.
      try {
        const r = await Promise.race([fetch(e.request, { cache: 'no-cache' }), new Promise((_, no) => setTimeout(() => no(new Error('lento')), 4000))]);
        if (r.ok) { cache.put('index.html', r.clone()); return r; }
      } catch (err) {}
      return (await cache.match('index.html')) || (await cache.match('./')) || fetch(e.request);
    }
    // Íconos y manifiesto: la copia guardada y, en segundo plano, la versión nueva.
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
