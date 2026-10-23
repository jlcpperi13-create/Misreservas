// Service worker de MisReservas
// Cada vez que subas cambios, sube también este número (v1 -> v2 -> v3...)
const CACHE = 'misreservas-v32';
const ARCHIVOS = ['./', './index.html', './admin.html', './firebase-config.js',
  './manifest.json', './manifest-panel.json', './colaborador.html', './manifest-colab.json', './colab-192.png', './colab-512.png',
  './cliente-192.png', './cliente-512.png', './panel-192.png', './panel-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Archivos propios: red con límite de 3 s; si tarda, la copia guardada
// (la versión nueva se guarda igual para la próxima vez).
// Firebase de gstatic (versión fija 9.23.0): copia guardada primero.
// Los datos (Firestore, avisos, Google) siguen yendo siempre directos a internet.
const FIREBASE_JS = /^https:\/\/www\.gstatic\.com\/firebasejs\/9\.23\.0\//;
function guardar(req, r) {
  if (r && (r.ok || r.type === 'opaque')) {
    const copia = r.clone();
    caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
  }
  return r;
}
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (FIREBASE_JS.test(url.href)) {
    e.respondWith(caches.match(e.request).then(c => c || fetch(e.request).then(r => guardar(e.request, r))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  const red = fetch(e.request).then(r => guardar(e.request, r));
  e.waitUntil(red.catch(() => {}));
  e.respondWith(new Promise(resolve => {
    let hecho = false;
    const copia = () => caches.match(e.request, { ignoreSearch: true });
    const t = setTimeout(() => copia().then(c => { if (c && !hecho) { hecho = true; resolve(c); } }), 3000);
    red.then(r => { if (!hecho) { hecho = true; clearTimeout(t); resolve(r); } })
       .catch(() => copia().then(c => { if (!hecho) { hecho = true; clearTimeout(t); resolve(c || Response.error()); } }));
  }));
});

// ---- Avisos push: se muestran aunque la app esté cerrada ----
self.addEventListener('push', e => {
  let d = {};
  try { const p = e.data ? e.data.json() : {}; d = p.data || p.notification || p; }
  catch (err) { d = { title: 'MisReservas', body: e.data ? e.data.text() : '' }; }
  const link = d.link || './admin.html';
  const icono = link.includes('colaborador') ? 'colab-192.png' : link.includes('admin') ? 'panel-192.png' : 'cliente-192.png';
  e.waitUntil(self.registration.showNotification(d.title || 'MisReservas', {
    body: d.body || '', icon: icono, badge: icono, tag: d.tag || undefined, renotify: true,
    requireInteraction: true, vibrate: [300, 150, 300], data: { link }
  }).then(() => marcarIcono()));
});
// Marca en el icono de la app (número de avisos sin ver) en los móviles que lo admiten.
// En Android el punto del icono lo pone el propio sistema mientras haya notificaciones sin quitar.
async function marcarIcono() {
  try {
    if (!self.navigator || !('setAppBadge' in self.navigator)) return;
    const n = (await self.registration.getNotifications()).length;
    await self.navigator.setAppBadge(n || undefined);
  } catch (err) {}
}
self.addEventListener('notificationclose', () => { marcarIcono(); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.split('?')[0] === link.split('?')[0] && 'focus' in c) return c.focus(); }
    return clients.openWindow(link);
  }));
});
