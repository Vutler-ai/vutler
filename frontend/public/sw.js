const CACHE_NAME = 'vutler-v1';
const STATIC_ASSETS = ['/dashboard', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Skip cross-origin requests entirely
  if (url.origin !== self.location.origin) return;
  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for static assets
  if (url.pathname.startsWith('/_next/') || url.pathname.match(/\.(css|js|png|jpg|svg|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return resp;
        })
      )
    );
    return;
  }
  // Network-first for HTML pages
  e.respondWith(
    fetch(e.request).then((resp) => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
      return resp;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/dashboard')))
  );
});
