// src/lib/useUserSettings.js
// Shared fetch for the `user_settings` row. Dedups concurrent callers.
//
// Three components read user_settings on every page load (Layout × 2 for onboarded
// + profile fields, NotificationToast for notification_prefs). Without this,
// three Supabase queries fire at the same moment. This hook fetches the full row
// once per user and returns the same cached copy to all callers.

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

let cachedRow = null
let cacheUserId = null
let inFlight = null

export function useUserSettings(user) {
  const [row, setRow] = useState(cacheUserId === user?.id ? cachedRow : null)
  const [loading, setLoading] = useState(!cachedRow)

  useEffect(() => {
    if (!user?.id) return
    if (cacheUserId === user.id && cachedRow) { setRow(cachedRow); setLoading(false); return }

    let cancelled = false
    setLoading(true)

    if (!inFlight || cacheUserId !== user.id) {
      inFlight = supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          cachedRow = data || {}
          cacheUserId = user.id
          return cachedRow
        })
        .catch(() => ({}))
        .finally(() => { inFlight = null })
    }

    inFlight.then(r => {
      if (cancelled) return
      setRow(r)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [user?.id])

  return { row: row || {}, loading }
}

export function invalidateUserSettings() {
  cachedRow = null
  cacheUserId = null
  inFlight = null
}
