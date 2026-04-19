import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const MORE_ITEMS = [
  { label: 'Contacts', path: '/contacts', icon: '👤' },
  { label: 'Organisations', path: '/organisations', icon: '🏢' },
]

export default function MobileBottomNav({ onKikoTap }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const isActive = (path) => {
    if (!path) return false
    if (path === '/') return loc.pathname === '/' || loc.pathname === '/home'
    return loc.pathname === path || loc.pathname.startsWith(path + '/')
  }

  const moreActive = MORE_ITEMS.some(m => isActive(m.path))

  const tabs = [
    { id: 'kiko', label: 'Kiko', path: '/', isKiko: true },
    { id: 'pipeline', label: 'Pipeline', path: '/pipeline', icon: '◇' },
    { id: 'hub', label: 'Hub', path: '/command-centre', icon: '⊞' },
    { id: 'calendar', label: 'Calendar', path: '/calendar', icon: '◎' },
    { id: 'more', label: 'More', path: null, icon: '≡' },
  ]

  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 998 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 80, left: 16, right: 16, background: '#FFFFFF', borderRadius: 16, padding: 6, boxShadow: '0 -12px 40px rgba(0,0,0,0.10)', border: '1px solid rgba(0,0,0,0.06)' }}>
            {MORE_ITEMS.map(m => (
              <button key={m.path} onClick={() => { nav(m.path); setMoreOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '16px 18px', border: 'none', borderRadius: 12,
                  background: isActive(m.path) ? '#F5F4F1' : 'transparent',
                  color: isActive(m.path) ? '#0A0A0A' : '#6B6B6B',
                  fontSize: 15, fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: isActive(m.path) ? 500 : 400, textAlign: 'left', cursor: 'pointer',
                }}>
                <span style={{ fontSize: 16 }}>{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="kiko-mobile-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 78,
        background: '#FEFEFC', borderTop: '1px solid rgba(0,0,0,0.06)',
        display: 'none', alignItems: 'flex-start', justifyContent: 'space-around',
        paddingTop: 8, paddingBottom: 'env(safe-area-inset-bottom, 12px)',
        zIndex: 999, fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {tabs.map(t => {
          const active = t.id === 'more' ? moreActive : isActive(t.path)
          return (
            <button key={t.id} onClick={() => {
              if (t.id === 'kiko') { if (onKikoTap) onKikoTap(); else nav('/') }
              else if (t.id === 'more') setMoreOpen(!moreOpen)
              else nav(t.path)
            }} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 14px',
              color: active ? '#0A0A0A' : '#A0A0A0', fontSize: 10,
              fontFamily: "'Inter', system-ui, sans-serif", fontWeight: active ? 500 : 400,
            }}>
              {t.isKiko ? (
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: active
                    ? 'linear-gradient(135deg, #7C5CFC 0%, #00D4AA 100%)'
                    : '#F5F4F1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: active ? '0 0 12px rgba(124,92,252,0.3)' : 'none',
                  transition: 'all 0.2s',
                }} />
              ) : (
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: active ? '#0A0A0A' : '#F5F4F1',
                  color: active ? '#FEFEFC' : '#A0A0A0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
                }}>{t.icon}</div>
              )}
              <span>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
