import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { applyFavicon } from '../lib/favicon'

const OrgContext = createContext(null)

export function OrgProvider({ children }) {
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadOrg(session) {
    if (!session) { setLoading(false); return }
    const orgId = session.user.app_metadata?.org_id
    if (!orgId) { setLoading(false); return }

    const { data, error } = await supabase
      .from('organisations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (error) { setLoading(false); return }
    if (data) {
      setOrg(data)
      if (data.branding?.platform_name && data.branding.platform_name !== 'Vela') document.title = data.branding.platform_name
      else document.title = 'Kiko'
      if (data.branding?.primary_colour) {
        document.documentElement.style.setProperty('--brand-primary', data.branding.primary_colour)
      }
      if (data.branding?.favicon_url) {
        // Safari-safe: applyFavicon removes and recreates link element
        applyFavicon(data.branding.favicon_url)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on subscribe — no separate getSession needed
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => loadOrg(session))
    return () => subscription.unsubscribe()
  }, [])

  const hasModule = (key) => org?.modules?.[key] === true
  const platformName = org?.branding?.platform_name || 'Kiko'
  const logoUrl = org?.branding?.logo_url || null

  return (
    <OrgContext.Provider value={{ org, loading, hasModule, platformName, logoUrl }}>
      {children}
    </OrgContext.Provider>
  )
}

export const useOrg = () => useContext(OrgContext)
