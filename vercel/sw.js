// HR AI REVIEW — Service Worker (stale-while-revalidate untuk static, jangan cache API)
const CACHE = 'hr-ai-review-v4';
const STATIC = ['/', '/index.html', '/style.css', '/app.js', '/pdf.min.js', '/pdf.worker.min.js', '/jspdf.umd.min.js', '/manifest.json', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Jangan intercept API calls GAS — biarkan browser handle langsung
  if (url.hostname.includes('script.google.com')) return;

  // Stale-while-revalidate: return cache jika ada, tapi tetap fetch untuk update cache
  // Jika tidak ada cache, tunggu fetch; jika fetch gagal, fallback ke cache
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((response) => {
          // Hanya cache response OK dari origin sendiri (bukan CDN cross-origin opaque)
          if (response && response.status === 200 && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      // Jika ada cache, return langsung (stale); fetch update di background
      // Jika tidak ada cache, tunggu fetch
      return cached || fetched;
    })
  );
});