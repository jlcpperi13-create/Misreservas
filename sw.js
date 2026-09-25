// Service worker de MisReservas
// Cada vez que subas cambios, sube también este número (v1 -> v2 -> v3...)
const CACHE = 'misreservas-v3';
const ARCHIVOS = ['./', './index.html', './admin.html', './firebase-config.js',
  './manifest.json', './manifest-panel.json',
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
