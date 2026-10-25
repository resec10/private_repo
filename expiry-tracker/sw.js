/* Service worker: offline support, background expiry checks, and notification clicks. */
importScripts('shared.js');

const CACHE = 'expiry-tracker-v1';
const ASSETS = [
  './', 'index.html', 'styles.css', 'shared.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/badge-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve from the cache straight away (works offline), refresh the cache in the background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req)
      .then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || (req.mode === 'navigate' && (await cache.match('index.html'))) || Response.error();
  })());
});

// Chrome/Edge on Android wake installed apps roughly daily for this, even when they are closed.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'expiry-check') event.waitUntil(runDailyCheck(self.registration));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => w.url.startsWith(scope));
    if (open) return open.focus();
    return self.clients.openWindow(scope);
  })());
});
