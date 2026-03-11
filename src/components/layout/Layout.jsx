import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
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
      {/* Floating top nav bar */}
      <div className="glass" style={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
        display: 'flex', gap: 4, borderRadius: 20, padding: 4
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

      <Sidebar />

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
