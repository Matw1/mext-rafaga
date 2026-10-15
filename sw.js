// MEXT Ráfaga — service worker: guarda la app en el teléfono para que funcione sin internet.
// Al publicar una versión nueva, sube el número de VERSION para que el teléfono la descargue.
const VERSION = 'mext-rafaga-v7';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la copia guardada (arranque instantáneo y offline); en segundo plano busca una versión nueva.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request)
        .then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) cache.put(e.request, r.clone()); return r; })
        .catch(() => hit || cache.match('index.html'));
      return hit || net;
    })
  );
});
