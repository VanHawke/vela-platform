import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  Home, GitBranch, Users, Building2, FileText,
  Settings, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { id:'home', icon:Home, path:'/', label:'Home' },
  { id:'pipeline', icon:GitBranch, path:'/pipeline', label:'Pipeline' },
  { id:'contacts', icon:Users, path:'/contacts', label:'Contacts' },
  { id:'companies', icon:Building2, path:'/companies', label:'Companies' },
  { id:'documents', icon:FileText, path:'/documents', label:'Documents' },
]

export default function Sidebar({ user }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [expanded, setExpanded] = useState(false)
  const platformName = 'Vela'
  const items = NAV
  const W_COLLAPSED = 60
  const W_EXPANDED = 240

  return (
    <aside style={{
      width: expanded ? W_EXPANDED : W_COLLAPSED,
      height: '100%',
      background: 'var(--glass-bg)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      borderRight: '1px solid var(--glass-border)',
      boxShadow: expanded ? 'var(--glass-shadow)' : 'none',
      display: 'flex', flexDirection: 'column',
      padding: '16px 0', flexShrink: 0,
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease',
      overflow: 'hidden', position: 'relative', zIndex: 20,
    }}>
      {/* Logo + expand toggle */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 14px', marginBottom: 24, minHeight: 36,
        justifyContent: expanded ? 'space-between' : 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => nav('/')}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', flexShrink: 0,
          }}>V</div>
          {expanded && (
            <span style={{
              fontSize: 15, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font)',
              whiteSpace: 'nowrap', opacity: expanded ? 1 : 0,
              transition: 'opacity 0.2s ease 0.1s',
            }}>{platformName || 'Vela'}</span>
          )}
        </div>
        <button onClick={() => setExpanded(!expanded)} style={{
          width: 24, height: 24, borderRadius: 6, border: 'none',
          background: 'var(--accent-soft)', color: 'var(--text-tertiary)',
          cursor: 'pointer', display: expanded ? 'flex' : 'none',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          transition: 'all 0.15s',
        }}>
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Nav items */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, width: '100%', padding: '0 10px' }}>
        {items.map(item => {
          const Icon = item.icon
          const active = loc.pathname === item.path || (item.path === '/' && loc.pathname === '/home')
          return (
            <button key={item.id} onClick={() => nav(item.path)} style={{
              width: '100%', height: 40, borderRadius: 'var(--radius-sm)', border: 'none',
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-tertiary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              gap: 12, padding: '0 10px',
              transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
            }}
              onMouseOver={e => { if (!active) e.currentTarget.style.background = 'var(--accent-soft)' }}
              onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={20} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              {expanded && (
                <span style={{
                  fontSize: 13, fontWeight: active ? 500 : 400, fontFamily: 'var(--font)',
                  opacity: expanded ? 1 : 0, transition: 'opacity 0.2s ease 0.05s',
                }}>{item.label}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Expand toggle (when collapsed) */}
      {!expanded && (
        <button onClick={() => setExpanded(true)} style={{
          width: 40, height: 40, borderRadius: 'var(--radius-sm)', border: 'none',
          background: 'transparent', color: 'var(--text-tertiary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 4px', transition: 'all 0.15s',
        }}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
          onMouseOut={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronRight size={16} />
        </button>
      )}

      {/* Bottom: Settings + user */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 10px' }}>
        <button onClick={() => nav('/settings')} style={{
          width: '100%', height: 40, borderRadius: 'var(--radius-sm)', border: 'none',
          background: loc.pathname === '/settings' ? 'var(--accent-soft)' : 'transparent',
          color: loc.pathname === '/settings' ? 'var(--text)' : 'var(--text-tertiary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 10px', transition: 'all 0.15s', overflow: 'hidden',
        }}>
          <Settings size={20} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          {expanded && <span style={{ fontSize: 13, fontFamily: 'var(--font)' }}>Settings</span>}
        </button>

        {/* User row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
          borderTop: '1px solid var(--border)', marginTop: 4,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)', flexShrink: 0,
          }}>
            {(user?.user_metadata?.full_name || user?.email || 'V')[0].toUpperCase()}
          </div>
          {expanded && (
            <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.user_metadata?.full_name || 'User'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || ''}
              </p>
            </div>
          )}
          {expanded && (
            <button onClick={async () => { await supabase.auth.signOut(); nav('/login') }} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
              padding: 4, display: 'flex', flexShrink: 0,
            }} title="Sign out"><LogOut size={14} /></button>
          )}
        </div>
      </div>
    </aside>
  )
}
