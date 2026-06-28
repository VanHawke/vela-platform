// public/sw.js — Kiko PWA Service Worker
// Handles: push notifications, offline caching, app install

const CACHE_NAME = 'kiko-v1'

// Listen for push notifications from the server
self.addEventListener('push', (event) => {
  let data = { title: 'Kiko', body: 'New notification', icon: '/kiko-icon-192.png' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch { /* use defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/kiko-icon-192.png',
      badge: '/kiko-icon-192.png',
      tag: data.tag || 'kiko-notification',
      data: data.url || '/',
      actions: data.actions || [],
      vibrate: [200, 100, 200],
    })
  )
})

// Handle notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Decline action on a call push: just dismiss. The callee tab is likely frozen/closed, so we cannot
  // signal a WebRTC decline from the service worker; dismissing is the honest behavior for now.
  if (event.action === 'decline') return
  const url = event.notification.data || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise open new window
      return clients.openWindow(url)
    })
  )
})

// Install — cache critical assets
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  )
})
