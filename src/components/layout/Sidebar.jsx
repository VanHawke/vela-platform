import { useNavigate, useLocation } from 'react-router-dom'
import {
  Home, Users, GitBranch, Diamond, Mail,
  Calendar, FileText, CheckSquare, Settings
} from 'lucide-react'

const NAV = [
  { id: 'home', icon: Home, path: '/' },
  { id: 'contacts', icon: Users, path: '/contacts' },
  { id: 'pipeline', icon: GitBranch, path: '/pipeline' },
  { id: 'deals', icon: Diamond, path: '/deals' },
  { id: 'email', icon: Mail, path: '/email' },
  { id: 'calendar', icon: Calendar, path: '/calendar' },
  { id: 'documents', icon: FileText, path: '/documents' },
  { id: 'tasks', icon: CheckSquare, path: '/tasks' },
]

export default function Sidebar() {
  const nav = useNavigate()
  const loc = useLocation()

  const isActive = (path) =>
    loc.pathname === path || (path === '/' && loc.pathname === '/home')

  return (
    <aside style={{
      width: 68, height: '100%', background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '20px 0', flexShrink: 0,
    }}>
      {/* V logo */}
      <div style={{ marginBottom: 32, cursor: 'pointer' }} onClick={() => nav('/')}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font)',
        }}>V</div>
      </div>

      {/* Nav items */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {NAV.map(item => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <button key={item.id} onClick={() => nav(item.path)} title={item.id.charAt(0).toUpperCase() + item.id.slice(1)} style={{
              width: 42, height: 42, borderRadius: 'var(--radius-sm)', border: 'none',
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-tertiary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
              onMouseOver={e => { if (!active) e.currentTarget.style.background = 'var(--accent-soft)' }}
              onMouseOut={e => { if (!active) e.currentTarget.style.background = active ? 'var(--accent-soft)' : 'transparent' }}
            >
              <Icon size={20} strokeWidth={1.8} />
            </button>
          )
        })}
      </nav>

      {/* Settings at bottom */}
      <button onClick={() => nav('/settings')} title="Settings" style={{
        width: 42, height: 42, borderRadius: 'var(--radius-sm)', border: 'none',
        background: loc.pathname === '/settings' ? 'var(--accent-soft)' : 'transparent',
        color: loc.pathname === '/settings' ? 'var(--text)' : 'var(--text-tertiary)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        <Settings size={20} strokeWidth={1.8} />
      </button>
    </aside>
  )
}
