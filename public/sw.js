// Kiko Intelligence OS — Service Worker v3
// Network-first (no caching) + Push notifications

const CACHE_NAME = 'kiko-v3';

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

// ── Push Notification Handler ──
self.addEventListener('push', (event) => {
  let data = { title: 'Kiko', body: 'New notification', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    console.error('[SW] Push parse error:', e);
  }

  const options = {
    body: data.body,
    icon: '/kiko-icon-192.png',
    badge: '/kiko-icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open Kiko' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: 'kiko-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Notification Click Handler ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes('kiko.vanhawke.agency') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return clients.openWindow(url);
    })
  );
});
