import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar'
import KikoFloat from '../kiko/KikoFloat'

const ALL_TOP_NAV = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'contacts', label: 'Contacts', path: '/contacts' },
  { id: 'organisations', label: 'Organisations', path: '/organisations' },
  { id: 'pipeline', label: 'Deal Pipeline', path: '/pipeline' },
  { id: 'email', label: 'Email', path: '/email' },
  { id: 'news', label: 'News', path: '/news' },
  { id: 'partnership-matrix', label: 'Matrix', path: '/partnership-matrix' },
  { id: 'calendar', label: 'Calendar', path: '/calendar' },
  { id: 'documents', label: 'Documents', path: '/documents' },
  { id: 'tasks', label: 'Tasks', path: '/tasks' },
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'settings', label: 'Settings', path: '/settings' },
]
const DEFAULT_TOP_IDS = ['home', 'contacts', 'pipeline', 'settings']

export default function Layout({ user }) {
  const loc = useLocation()
  const nav = useNavigate()
  const isHome = loc.pathname === '/' || loc.pathname === '/home'

  // Branding — icon (collapsed) + wide logo (expanded)
  const [logoIcon, setLogoIcon] = useState(null)
  const [logoExpanded, setLogoExpanded] = useState(null)
  useEffect(() => {
    if (!user?.id) return
    supabase.from('user_settings').select('platform_logo_url, sidebar_expanded_logo_url').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data?.platform_logo_url) setLogoIcon(data.platform_logo_url)
        if (data?.sidebar_expanded_logo_url) setLogoExpanded(data.sidebar_expanded_logo_url)
      })
    const onUpdate = () => {
      supabase.from('user_settings').select('platform_logo_url, sidebar_expanded_logo_url').eq('user_id', user.id).single()
        .then(({ data }) => {
          if (data?.platform_logo_url) setLogoIcon(data.platform_logo_url)
          if (data?.sidebar_expanded_logo_url) setLogoExpanded(data.sidebar_expanded_logo_url)
        })
    }
    window.addEventListener('vela_profile_updated', onUpdate)
    return () => window.removeEventListener('vela_profile_updated', onUpdate)
  }, [user?.id])

  // Top nav config
  const [topNavIds, setTopNavIds] = useState(DEFAULT_TOP_IDS)
  useEffect(() => {
    const load = () => {
      try {
        const stored = localStorage.getItem('vela_top_nav')
        if (stored) setTopNavIds(JSON.parse(stored))
      } catch {}
    }
    load()
    window.addEventListener('vela_top_nav_updated', load)
    return () => window.removeEventListener('vela_top_nav_updated', load)
  }, [])
  const topNav = topNavIds.map(id => ALL_TOP_NAV.find(n => n.id === id)).filter(Boolean)

  // Kiko conversation state — persists across page navigation
  const [kikoMessages, setKikoMessages] = useState([])
  const [kikoConvId, setKikoConvId] = useState(null)
  const [kikoResetKey, setKikoResetKey] = useState(0)

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') e.preventDefault()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Called by Kiko when she wants to navigate
  function kikoNavigate(page) {
    const path = page === 'home' ? '/' : `/${page}`
    nav(path)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Floating top nav bar — glass with drop shadow */}
      <div style={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
        display: 'flex', gap: 4, borderRadius: 20, padding: 4,
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        border: '0.5px solid rgba(0,0,0,0.06)',
        boxShadow: '0 8px 36px rgba(0,0,0,0.09), 0 2px 6px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.9)',
      }}>
        {topNav.map(item => {
          const active = loc.pathname === item.path || (item.path === '/' && loc.pathname === '/home')
          return (
            <button key={item.path} onClick={() => {
              if (item.path === '/') { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1) }
              nav(item.path)
            }} style={{
              padding: '6px 14px', borderRadius: 16, border: 'none',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s',
              boxShadow: active ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
            }}>{item.label}</button>
          )
        })}
      </div>

      <Sidebar logoIcon={logoIcon} logoExpanded={logoExpanded} user={user} onHomeClick={() => { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1) }} />

      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', paddingTop: 52 }}>
        <Outlet context={{ kikoMessages, setKikoMessages, kikoConvId, setKikoConvId, kikoNavigate, kikoResetKey }} />
      </main>

      {/* Kiko floating — present on every page except home */}
      {!isHome && (
        <KikoFloat
          user={user}
          messages={kikoMessages}
          setMessages={setKikoMessages}
          convId={kikoConvId}
          setConvId={setKikoConvId}
          onNavigate={kikoNavigate}
        />
      )}
    </div>
  )
}
