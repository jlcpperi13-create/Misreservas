// Service worker de MisReservas
// Cada vez que subas cambios, sube también este número (v1 -> v2 -> v3...)
const CACHE = 'misreservas-v11';
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
// Primero la red (siempre la versión nueva); si no hay conexión, la copia guardada.
// Solo archivos propios: Firebase va siempre directo a internet.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// ---- Avisos push: se muestran aunque la app esté cerrada ----
self.addEventListener('push', e => {
  let d = {};
  try { const p = e.data ? e.data.json() : {}; d = p.data || p.notification || p; }
  catch (err) { d = { title: 'MisReservas', body: e.data ? e.data.text() : '' }; }
  const link = d.link || './admin.html';
  const icono = link.includes('colaborador') ? 'colab-192.png' : 'panel-192.png';
  e.waitUntil(self.registration.showNotification(d.title || 'MisReservas', {
    body: d.body || '', icon: icono, badge: icono, tag: d.tag || undefined, renotify: true,
    requireInteraction: true, vibrate: [300, 150, 300], data: { link }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.split('?')[0] === link.split('?')[0] && 'focus' in c) return c.focus(); }
    return clients.openWindow(link);
  }));
});
