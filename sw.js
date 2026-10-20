// MEXT Ráfaga — service worker: guarda la app en el teléfono para que funcione sin internet.
// Al publicar una versión nueva, sube el número de VERSION para que el teléfono la descargue.
const VERSION = 'mext-rafaga-v24';
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

// Envíos pendientes sin conexión (borradores del estudio y entregas): la app los deja en IndexedDB
// y el teléfono los manda solo cuando vuelve la conexión, aunque la app esté cerrada (Background Sync).
const idb = () => new Promise((ok, no) => {
  const r = indexedDB.open('mext-bg', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('q');
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const tx = (db, modo, fn) => new Promise((ok, no) => {
  const t = db.transaction('q', modo), res = fn(t.objectStore('q'));
  t.oncomplete = () => ok(res && res.result); t.onerror = () => no(t.error);
});
async function enviarPendientes() {
  const db = await idb();
  const claves = await tx(db, 'readonly', s => s.getAllKeys());
  let falta = false;
  for (const k of claves) {
    const p = await tx(db, 'readonly', s => s.get(k));
    if (!p) continue;
    try {
      const r = await fetch(p.url, { method: 'POST', headers: p.headers, body: p.body });
      if (r.ok || r.status === 400 || r.status === 401) await tx(db, 'readwrite', s => s.delete(k));
      else falta = true;
    } catch (e) { falta = true; }
  }
  if (falta) throw new Error('sin conexión: se reintenta');
}
self.addEventListener('sync', e => { if (e.tag === 'mext-bg') e.waitUntil(enviarPendientes()); });
