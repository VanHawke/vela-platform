// src/lib/pushNotifications.js — Client-side push notification registration
// Call registerPush() on mobile after login to subscribe for notifications

export async function getVapidKey() {
  const res = await fetch('https://api.vanhawke.agency/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'vapid-key' }),
  })
  const data = await res.json()
  return data.publicKey
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export async function registerPush(userId, userEmail) {
  try {
    // Check support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[Push] Not supported')
      return false
    }

    // Register service worker if not already
    const registration = await navigator.serviceWorker.ready

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription()
    
    if (!subscription) {
      // Get VAPID key
      const vapidKey = await getVapidKey()
      if (!vapidKey) {
        console.error('[Push] No VAPID key')
        return false
      }

      // Request permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        console.log('[Push] Permission denied')
        return false
      }

      // Subscribe
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }

    // Send subscription to server
    const res = await fetch('https://api.vanhawke.agency/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'subscribe',
        subscription: {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
            auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))),
          },
        },
        userId,
        userEmail,
        deviceInfo: navigator.userAgent.slice(0, 100),
      }),
    })

    const data = await res.json()
    console.log('[Push] Registered:', data)
    return true
  } catch (err) {
    console.error('[Push] Registration failed:', err)
    return false
  }
}

export async function unregisterPush() {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await fetch('https://api.vanhawke.agency/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unsubscribe', subscription: { endpoint: subscription.endpoint } }),
      })
      await subscription.unsubscribe()
    }
    return true
  } catch (err) {
    console.error('[Push] Unregister failed:', err)
    return false
  }
}


// Show a browser notification (non-push, for in-app use)
export function showPushNotification(title, body, options = {}) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    const n = new Notification(title, {
      body,
      icon: '/kiko-icon-192.png',
      badge: '/kiko-icon-192.png',
      tag: options.tag || 'kiko',
      renotify: true,
    })
    if (options.url) {
      n.onclick = () => { window.focus(); window.location.href = options.url; n.close() }
    }
  }
}


// Request browser notification permission (non-push, for desktop notifications)
export async function requestPushPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  const result = await Notification.requestPermission()
  return result
}
// favicon-fix-1776699943
export const PUSH_VERSION = '5dot3'
