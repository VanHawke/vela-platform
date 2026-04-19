import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const MORE_ITEMS = [
  { label: 'Contacts', path: '/contacts' },
  { label: 'Organisations', path: '/organisations' },
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
    { id: 'kiko', label: 'Kiko', path: '/' },
    { id: 'pipeline', label: 'Pipeline', path: '/pipeline' },
    { id: 'hub', label: 'Hub', path: '/command-centre' },
    { id: 'calendar', label: 'Calendar', path: '/calendar' },
    { id: 'more', label: 'More', path: null },
  ]

  const icons = {
    pipeline: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    hub: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    calendar: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    more: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  }

  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 998 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 'calc(40px + env(safe-area-inset-bottom, 4px))', left: 16, right: 16, background: '#FFFFFF', borderRadius: 16, padding: 6, boxShadow: '0 -8px 32px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.05)' }}>
            {MORE_ITEMS.map(m => (
              <button key={m.path} onClick={() => { nav(m.path); setMoreOpen(false) }}
                style={{
                  display: 'block', width: '100%', padding: '14px 18px', border: 'none', borderRadius: 12,
                  background: isActive(m.path) ? '#F5F4F1' : 'transparent',
                  color: isActive(m.path) ? '#0A0A0A' : '#6B6B6B',
                  fontSize: 15, fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: isActive(m.path) ? 500 : 400, textAlign: 'left', cursor: 'pointer',
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="kiko-mobile-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#FEFEFC', borderTop: '1px solid rgba(0,0,0,0.05)',
        display: 'none', alignItems: 'flex-start', justifyContent: 'space-around',
        paddingTop: 5, paddingBottom: 'env(safe-area-inset-bottom, 4px)',
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
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 10px',
              color: active ? '#0A0A0A' : '#A0A0A0', fontSize: 9,
              fontFamily: "'Inter', system-ui, sans-serif", fontWeight: active ? 500 : 400,
            }}>
              {t.id === 'kiko' ? (
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'radial-gradient(circle at 40% 35%, rgba(35,28,55,1), rgba(15,13,22,1))',
                  boxShadow: active ? '0 0 6px rgba(124,92,252,0.25)' : 'none',
                }} />
              ) : (
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: active ? '#0A0A0A' : '#F5F4F1',
                  color: active ? '#FEFEFC' : '#A0A0A0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{icons[t.id]}</div>
              )}
              <span>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
