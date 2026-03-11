import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
      if (data.branding?.platform_name) document.title = data.branding.platform_name
      if (data.branding?.primary_colour) {
        document.documentElement.style.setProperty('--brand-primary', data.branding.primary_colour)
      }
      if (data.branding?.favicon_url) {
        let link = document.querySelector("link[rel~='icon']")
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
        link.href = data.branding.favicon_url
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
  const platformName = org?.branding?.platform_name || 'Vela'
  const logoUrl = org?.branding?.logo_url || null

  return (
    <OrgContext.Provider value={{ org, loading, hasModule, platformName, logoUrl }}>
      {children}
    </OrgContext.Provider>
  )
}

export const useOrg = () => useContext(OrgContext)
