// src/lib/pushNotifications.js — Browser push notification utility
// Requests permission on first call, then shows native notifications
// for hot replies, deal updates, and task reminders.

let permissionGranted = null

export async function requestPushPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') { permissionGranted = true; return true }
  if (Notification.permission === 'denied') { permissionGranted = false; return false }
  const result = await Notification.requestPermission()
  permissionGranted = result === 'granted'
  return permissionGranted
}

export function showPushNotification(title, body, options = {}) {
  if (!permissionGranted || !('Notification' in window)) return null
  // Don't show if tab is focused (user already sees the toast)
  if (document.hasFocus()) return null
  try {
    const notif = new Notification(title, {
      body,
      icon: '/kiko-icon-192.png',
      badge: '/kiko-icon-192.png',
      tag: options.tag || 'kiko-' + Date.now(),
      silent: options.silent || false,
      ...options,
    })
    notif.onclick = () => {
      window.focus()
      if (options.url) window.location.href = options.url
      notif.close()
    }
    // Auto-close after 8 seconds
    setTimeout(() => notif.close(), 8000)
    return notif
  } catch (e) {
    console.warn('[Push] Failed:', e.message)
    return null
  }
}

// Notification type helpers
export function pushHotReply(entityName, title) {
  return showPushNotification(
    `Reply from ${entityName}`,
    title || 'New reply received',
    { tag: 'hot-reply', url: '/command-centre' }
  )
}

export function pushDealUpdate(dealName, action) {
  return showPushNotification(
    `Deal: ${dealName}`,
    action || 'Deal updated',
    { tag: 'deal-update', url: '/pipeline' }
  )
}

export function pushTaskDue(taskTitle) {
  return showPushNotification(
    'Task Due',
    taskTitle || 'You have a task due',
    { tag: 'task-due', url: '/command-centre' }
  )
}
