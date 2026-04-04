const CACHE_VERSION = 'vutler-v6';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

const APP_SHELL_URLS = [
  '/login',
  '/offline',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

// ─── Activate — clean old caches ─────────────────────────────────────────────

self.addEventListener('activate', (e) => {
  const currentCaches = [APP_SHELL_CACHE, STATIC_CACHE, API_CACHE];
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !currentCaches.includes(k))
            .map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Never attempt to cache non-GET requests.
  if (e.request.method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Network-first for API calls (cache for offline fallback)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/internal/')) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          safeCachePut(API_CACHE, e.request, resp);
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.match(/\.(css|js|png|jpg|jpeg|webp|svg|woff2?|ico)$/)
  ) {
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ||
          fetch(e.request).then((resp) => {
            safeCachePut(STATIC_CACHE, e.request, resp);
            return resp;
          })
      )
    );
    return;
  }

  // Network-first for HTML pages, offline fallback
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        safeCachePut(APP_SHELL_CACHE, e.request, resp);
        return resp;
      })
      .catch(
        () =>
          caches.match(e.request).then((r) => r || caches.match('/offline')) ||
          new Response('Offline', { status: 503 })
      )
  );
});

function safeCachePut(cacheName, request, response) {
  if (request.method !== 'GET' || !response || !response.ok) {
    return;
  }

  const clone = response.clone();
  caches.open(cacheName)
    .then((cache) => cache.put(request, clone))
    .catch(() => {});
}

// ─── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (e) => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: 'Vutler', body: e.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || '/dashboard',
      id: payload.id,
    },
    actions: payload.actions || [],
    tag: payload.tag || 'vutler-notification',
    renotify: !!payload.tag,
  };

  e.waitUntil(self.registration.showNotification(payload.title || 'Vutler', options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const targetUrl = e.notification.data?.url || '/dashboard';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (new URL(client.url).pathname === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow(targetUrl);
    })
  );
});

// ─── Background Sync ─────────────────────────────────────────────────────────

self.addEventListener('sync', (e) => {
  if (e.tag === 'vutler-sync') {
    e.waitUntil(replayQueuedRequests());
  }
});

async function replayQueuedRequests() {
  try {
    const db = await openSyncDB();
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const all = await idbGetAll(store);

    for (const entry of all) {
      try {
        await fetch(entry.url, {
          method: entry.method,
          headers: entry.headers,
          body: entry.body,
        });
        store.delete(entry.id);
      } catch {
        // Will retry on next sync
        break;
      }
    }
  } catch {
    // IndexedDB not available
  }
}

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('vutler-sync', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
