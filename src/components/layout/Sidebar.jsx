import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Home, Users, GitBranch, Diamond, Mail,
  Calendar, FileText, CheckSquare, Settings
} from 'lucide-react'

const NAV = [
  { id: 'home', label: 'Home', icon: Home, path: '/' },
  { id: 'contacts', label: 'Contacts', icon: Users, path: '/contacts' },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch, path: '/pipeline' },
  { id: 'deals', label: 'Deals', icon: Diamond, path: '/deals' },
  { id: 'email', label: 'Email', icon: Mail, path: '/email' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, path: '/calendar' },
  { id: 'documents', label: 'Documents', icon: FileText, path: '/documents' },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare, path: '/tasks' },
]

const W_COLLAPSED = 52
const W_EXPANDED = 200

export default function Sidebar({ brandLogo }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [expanded, setExpanded] = useState(false)

  const isActive = (path) =>
    loc.pathname === path || (path === '/' && loc.pathname === '/home')

  const w = expanded ? W_EXPANDED : W_COLLAPSED

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        width: w, minWidth: w, height: '100%',
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '16px 0', flexShrink: 0,
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden', zIndex: 50,
      }}>

      {/* Brand logo / V mark */}
      <div style={{ padding: '0 8px', marginBottom: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', height: 36 }}
        onClick={() => nav('/')}>
        {brandLogo ? (
          <img src={brandLogo} alt="" style={{
            height: 28, maxWidth: expanded ? 160 : 36, objectFit: 'contain',
            transition: 'max-width 0.2s', borderRadius: 6,
          }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', flexShrink: 0,
            }}>V</div>
            {expanded && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font)', opacity: expanded ? 1 : 0, transition: 'opacity 0.15s' }}>Vela</span>}
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, padding: '0 8px' }}>
        {NAV.map(item => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <button key={item.id} onClick={() => nav(item.path)} style={{
              height: 36, borderRadius: 8, border: 'none', padding: '0 8px',
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-tertiary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              transition: 'all 0.15s', overflow: 'hidden', whiteSpace: 'nowrap',
            }}
              onMouseOver={e => { if (!active) e.currentTarget.style.background = 'var(--accent-soft)' }}
              onMouseOut={e => { e.currentTarget.style.background = active ? 'var(--accent-soft)' : 'transparent' }}
            >
              <Icon size={18} strokeWidth={1.8} style={{ flexShrink: 0, marginLeft: expanded ? 0 : 1 }} />
              {expanded && <span style={{ fontSize: 13, fontWeight: active ? 500 : 400, fontFamily: 'var(--font)' }}>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Settings at bottom */}
      <div style={{ padding: '0 8px' }}>
        <button onClick={() => nav('/settings')} style={{
          height: 36, borderRadius: 8, border: 'none', padding: '0 8px', width: '100%',
          background: loc.pathname === '/settings' ? 'var(--accent-soft)' : 'transparent',
          color: loc.pathname === '/settings' ? 'var(--text)' : 'var(--text-tertiary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          transition: 'all 0.15s', overflow: 'hidden', whiteSpace: 'nowrap',
        }}>
          <Settings size={18} strokeWidth={1.8} style={{ flexShrink: 0, marginLeft: expanded ? 0 : 1 }} />
          {expanded && <span style={{ fontSize: 13, fontFamily: 'var(--font)' }}>Settings</span>}
        </button>
      </div>
    </aside>
  )
}
