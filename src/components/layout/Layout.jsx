import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar'
import KikoFloat from '../kiko/KikoFloat'

const TOP_NAV = [
  { label: 'Home', path: '/' },
  { label: 'Contacts', path: '/contacts' },
  { label: 'Pipeline', path: '/pipeline' },
  { label: 'Deals', path: '/deals' },
  { label: 'Settings', path: '/settings' },
]

export default function Layout({ user }) {
  const loc = useLocation()
  const nav = useNavigate()
  const isHome = loc.pathname === '/' || loc.pathname === '/home'

  // Branding
  const [brandLogo, setBrandLogo] = useState(null)
  useEffect(() => {
    if (!user?.id) return
    supabase.from('user_settings').select('platform_logo_url').eq('user_id', user.id).single()
      .then(({ data }) => { if (data?.platform_logo_url) setBrandLogo(data.platform_logo_url) })
  }, [user?.id])

  // Kiko conversation state — persists across page navigation
  const [kikoMessages, setKikoMessages] = useState([])
  const [kikoConvId, setKikoConvId] = useState(null)

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
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.03)',
      }}>
        {TOP_NAV.map(item => {
          const active = loc.pathname === item.path || (item.path === '/' && loc.pathname === '/home')
          return (
            <button key={item.path} onClick={() => nav(item.path)} style={{
              padding: '6px 14px', borderRadius: 16, border: 'none',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s'
            }}>{item.label}</button>
          )
        })}
      </div>

      <Sidebar brandLogo={brandLogo} />

      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Outlet context={{ kikoMessages, setKikoMessages, kikoConvId, setKikoConvId, kikoNavigate }} />
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
