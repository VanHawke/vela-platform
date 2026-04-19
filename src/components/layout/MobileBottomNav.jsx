import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const TABS = [
  { id: 'kiko', label: 'Kiko', path: '/', icon: 'K' },
  { id: 'pipeline', label: 'Pipeline', path: '/pipeline', icon: '◇' },
  { id: 'hub', label: 'Hub', path: '/command-centre', icon: '⊞' },
  { id: 'calendar', label: 'Calendar', path: '/calendar', icon: '◎' },
  { id: 'more', label: 'More', path: null, icon: '≡' },
]

const MORE_ITEMS = [
  { label: 'Contacts', path: '/contacts' },
  { label: 'Organisations', path: '/organisations' },
  { label: 'Partnership Matrix', path: '/partnership-matrix' },
  { label: 'Campaigns', path: '/campaigns' },
  { label: 'Settings', path: '/settings' },
]

const C = {
  bg: '#FEFEFC', text: '#0A0A0A', dim: '#6B6B6B', faint: '#A0A0A0',
  tinted: '#F5F4F1', border: 'rgba(0,0,0,0.06)', font: "'Inter', system-ui, sans-serif",
}

export default function MobileBottomNav({ onKikoTap }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const isActive = (path) => {
    if (!path) return false
    if (path === '/') return loc.pathname === '/' || loc.pathname === '/home'
    return loc.pathname === path || loc.pathname.startsWith(path + '/')
  }

  const moreIsActive = MORE_ITEMS.some(m => loc.pathname === m.path || loc.pathname.startsWith(m.path + '/'))

  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 998 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 72, left: 16, right: 16, background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 14, padding: 8, boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}>
            {MORE_ITEMS.map(m => (
              <button key={m.path} onClick={() => { nav(m.path); setMoreOpen(false) }}
                style={{ display: 'block', width: '100%', padding: '14px 16px', border: 'none', background: loc.pathname === m.path ? C.tinted : 'transparent', color: loc.pathname === m.path ? C.text : C.dim, fontSize: 14, fontFamily: C.font, fontWeight: loc.pathname === m.path ? 500 : 400, textAlign: 'left', cursor: 'pointer', borderRadius: 8 }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <nav className="kiko-mobile-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 72,
        background: C.bg, borderTop: `1px solid ${C.border}`,
        display: 'none', alignItems: 'center', justifyContent: 'space-around',
        padding: '0 8px 12px', zIndex: 999, fontFamily: C.font,
      }}>
        {TABS.map(t => {
          const active = t.id === 'more' ? moreIsActive : isActive(t.path)
          return (
            <button key={t.id} onClick={() => {
              if (t.id === 'kiko') { if (onKikoTap) onKikoTap(); else nav('/') }
              else if (t.id === 'more') setMoreOpen(!moreOpen)
              else nav(t.path)
            }} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px',
              color: active ? C.text : C.faint, fontSize: 9, fontFamily: C.font,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: active ? C.text : C.tinted,
                color: active ? C.bg : C.faint,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 500, transition: 'all 0.15s',
              }}>{t.icon}</div>
              <span style={{ fontWeight: active ? 500 : 400 }}>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
