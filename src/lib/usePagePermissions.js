// src/lib/usePagePermissions.js — Hook: resolve current user's page permissions
// Returns { effective, loading, canSee(pageKey) }
import { useState, useEffect } from 'react'

let cachedEffective = null
let cacheUserId = null
let inFlight = null  // Promise<effective> — dedups concurrent callers (Layout + TopNav + PermissionGate mount simultaneously)

export function usePagePermissions(user, orgId) {
  const [effective, setEffective] = useState(cachedEffective || {})
  const [loading, setLoading] = useState(!cachedEffective)

  useEffect(() => {
    if (!user?.id || !orgId) return
    // Fast path: cached for this user
    if (cacheUserId === user.id && cachedEffective) { setEffective(cachedEffective); setLoading(false); return }

    let cancelled = false
    setLoading(true)

    // Share one in-flight fetch across all concurrent callers on mount
    if (!inFlight || cacheUserId !== user.id) {
      inFlight = fetch(`/api/user-permissions?user_id=${user.id}&organization_id=${orgId}`)
        .then(r => r.json())
        .then(d => {
          const eff = d.effective || {}
          cachedEffective = eff
          cacheUserId = user.id
          return eff
        })
        .catch(() => ({}))
        .finally(() => { inFlight = null })
    }

    inFlight.then(eff => {
      if (cancelled) return
      setEffective(eff)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [user?.id, orgId])

  const canSee = (pageKey) => {
    if (!pageKey) return true
    // If no permissions loaded yet, show everything (don't flash-hide during load)
    if (Object.keys(effective).length === 0) return true
    return effective[pageKey] !== false
  }

  return { effective, loading, canSee }
}

// Invalidate cache (call after permission change)
export function invalidatePagePermissions() {
  cachedEffective = null
  cacheUserId = null
  inFlight = null
}
