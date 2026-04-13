// src/lib/favicon.js — Safari-safe favicon application
//
// Why this exists: Safari does NOT reliably observe dynamic mutations to
// <link rel="icon">.href. Every other browser refetches the favicon when
// you mutate the href via JS, but Safari locks in whatever URL it saw at
// initial HTML parse time and ignores later changes. The WORKING pattern
// is to REMOVE all existing favicon link elements and CREATE fresh ones,
// which Safari treats as a new declaration and processes.
//
// Usage:
//   import { applyFavicon, DEFAULT_FAVICON } from '@/lib/favicon'
//   applyFavicon(customUrl)            // apply custom uploaded favicon
//   applyFavicon(DEFAULT_FAVICON)      // reset to default Kiko icon

export const DEFAULT_FAVICON = '/kiko-icon-192.png?v=2'

export function applyFavicon(url) {
  if (!url) url = DEFAULT_FAVICON
  try {
    // Remove every existing favicon link element (Safari ignores mutations, must be fresh)
    document
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
      .forEach((el) => el.remove())

    // Create a fresh link[rel="icon"] element
    const mime = url.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
    const primary = document.createElement('link')
    primary.rel = 'icon'
    primary.type = mime
    primary.href = url
    document.head.appendChild(primary)

    // Safari legacy fallback path — older Safari versions prefer "shortcut icon"
    const legacy = document.createElement('link')
    legacy.rel = 'shortcut icon'
    legacy.type = mime
    legacy.href = url
    document.head.appendChild(legacy)
  } catch {
    // Fail silently — favicon is non-essential, never break the app for it
  }
}
