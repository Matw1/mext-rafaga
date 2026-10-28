// MEXT RÃ¡faga â€” service worker: guarda la app en el telÃ©fono para que funcione sin internet.
// Al publicar una versiÃ³n nueva, sube el nÃºmero de VERSION para que el telÃ©fono la descargue.
const VERSION = 'mext-rafaga-v48';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js'];

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
      // Solo sirve una respuesta que sea de verdad la app: un wifi con portal o el operador sin saldo
      // pueden contestar Â«200Â» con otra pÃ¡gina, y esa no debe reemplazar a la copia guardada.
      const MARCA = '<title>MEXT RÃ¡faga';
      const esApp = async r => !!r && r.ok && !r.redirected && (await r.clone().text()).includes(MARCA);
      const net = fetch(e.request, { cache: 'no-cache' }).then(async r => {
        if (!(await esApp(r))) throw new Error('no es la app');
        cache.put('index.html', r.clone());
        return r;
      });
      net.catch(() => {});
      const tope = new Promise((_, no) => setTimeout(() => no(new Error('lento')), 3000));
      try { return await Promise.race([net, tope]); }
      catch (err) {
        for (const k of ['index.html', './']) { const c = await cache.match(k); if (await esApp(c)) return c; }
        try { return await net; } catch (e2) {
          return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;padding:24px"><h2>Sin conexiÃ³n</h2><p>Esta vez la app no quedÃ³ guardada en el telÃ©fono. Ãbrela una vez con internet y despuÃ©s funcionarÃ¡ sin conexiÃ³n.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
      }
    }
    // Ãconos y manifiesto: la copia guardada y, en segundo plano, la versiÃ³n nueva.
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// EnvÃ­os pendientes sin conexiÃ³n (borradores del estudio y entregas): la app los deja en IndexedDB
// y el telÃ©fono los manda solo cuando vuelve la conexiÃ³n, aunque la app estÃ© cerrada (Background Sync).
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
  if (falta) throw new Error('sin conexiÃ³n: se reintenta');
}
self.addEventListener('sync', e => { if (e.tag === 'mext-bg') e.waitUntil(enviarPendientes()); });
