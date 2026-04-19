// Kiko Intelligence OS — Service Worker v2
// Minimal: network-first, no caching of HTML

const CACHE_NAME = 'kiko-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Always go to network, never cache
  return;
});
