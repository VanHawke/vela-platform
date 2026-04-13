import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { applyFavicon, DEFAULT_FAVICON } from '../lib/favicon'

const OrgContext = createContext(null)

// localStorage cache key — used to survive page reloads and give the inline
// IIFE in index.html an instant favicon on subsequent visits
const CACHE_KEY = 'kiko_branding_cache'

function readCachedBranding() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function writeCachedBranding(branding) {
  try {
    if (branding) localStorage.setItem(CACHE_KEY, JSON.stringify(branding))
    else localStorage.removeItem(CACHE_KEY)
    // Legacy key used by the inline IIFE in index.html — keep in sync for instant favicon on next load
    if (branding?.favicon_url) localStorage.setItem('custom_favicon_url', branding.favicon_url)
    else localStorage.removeItem('custom_favicon_url')
  } catch {}
}

function applyBranding(branding) {
  if (!branding) return
  // Document title — fall back to Kiko if platform_name is unset
  if (branding.platform_name) document.title = branding.platform_name
  else document.title = 'Kiko'
  // Primary brand colour → CSS variable
  if (branding.primary_colour) {
    document.documentElement.style.setProperty('--brand-primary', branding.primary_colour)
  }
  // Favicon — Safari-safe remove-and-recreate via helper
  applyFavicon(branding.favicon_url || DEFAULT_FAVICON)
}

export function OrgProvider({ children }) {
  const [org, setOrg] = useState(null)
  const [branding, setBranding] = useState(() => readCachedBranding())
  const [loading, setLoading] = useState(true)

  // Apply cached branding synchronously on mount so there's no flicker between
  // the inline IIFE favicon load and React's first render
  useEffect(() => {
    const cached = readCachedBranding()
    if (cached) applyBranding(cached)
  }, [])

  // Fetch public branding — works with or without auth, single source of truth
  // for login-page branding and the initial paint on authenticated pages
  const loadPublicBranding = useCallback(async () => {
    try {
      const res = await fetch('/api/public-branding')
      if (!res.ok) return null
      const data = await res.json()
      if (data?.branding) {
        setBranding(data.branding)
        writeCachedBranding(data.branding)
        applyBranding(data.branding)
        return data.branding
      }
    } catch (err) {
      console.warn('[OrgContext] public-branding fetch failed:', err?.message)
    }
    return null
  }, [])

  // Fetch authenticated org data (the full organisations row, not just branding)
  const loadOrg = useCallback(async (session) => {
    if (!session) {
      // No session → login page. Public branding only.
      await loadPublicBranding()
      setLoading(false)
      return
    }
    const orgId = session.user.app_metadata?.org_id
    if (!orgId) {
      // Authenticated but no org_id in metadata — still try public branding
      await loadPublicBranding()
      setLoading(false)
      return
    }
    try {
      const { data, error } = await supabase
        .from('organisations')
        .select('*')
        .eq('id', orgId)
        .single()
      if (error) {
        await loadPublicBranding()
      } else if (data) {
        setOrg(data)
        setBranding(data.branding || {})
        writeCachedBranding(data.branding || {})
        applyBranding(data.branding || {})
      }
    } finally {
      setLoading(false)
    }
  }, [loadPublicBranding])

  // Called by Settings.jsx after a successful /api/org-branding PATCH.
  // Merges the returned branding into state and re-applies document-level
  // effects (favicon, title, colour) immediately — no refetch needed.
  const setBrandingFromServer = useCallback((newBranding) => {
    if (!newBranding) return
    setBranding(newBranding)
    writeCachedBranding(newBranding)
    applyBranding(newBranding)
    // Also update org state if we have it, so consumers reading org.branding see the update
    setOrg((prev) => (prev ? { ...prev, branding: newBranding } : prev))
  }, [])

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on subscribe — handles both signed-in and signed-out cases
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => loadOrg(session))
    return () => subscription.unsubscribe()
  }, [loadOrg])

  const hasModule = (key) => org?.modules?.[key] === true
  const platformName = branding?.platform_name || 'Kiko'
  const logoUrl = branding?.logo_url || null
  const faviconUrl = branding?.favicon_url || null

  return (
    <OrgContext.Provider
      value={{
        org,
        loading,
        hasModule,
        platformName,
        logoUrl,
        faviconUrl,
        branding,
        setBrandingFromServer,
      }}
    >
      {children}
    </OrgContext.Provider>
  )
}

export const useOrg = () => useContext(OrgContext)
