import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import {
  Home, Mail, Calendar, LayoutDashboard, GitBranch,
  Briefcase, Users, Building2, CheckSquare, FileText,
  Settings, LogOut
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { id:'home', icon:Home, path:'/', module:null },
  { id:'email', icon:Mail, path:'/email', module:'email' },
  { id:'calendar', icon:Calendar, path:'/calendar', module:'calendar' },
  { id:'dashboard', icon:LayoutDashboard, path:'/dashboard', module:'crm' },
  { id:'pipeline', icon:GitBranch, path:'/pipeline', module:'crm' },
  { id:'deals', icon:Briefcase, path:'/deals', module:'crm' },
  { id:'contacts', icon:Users, path:'/contacts', module:'crm' },
  { id:'companies', icon:Building2, path:'/companies', module:'crm' },
  { id:'tasks', icon:CheckSquare, path:'/tasks', module:'tasks' },
  { id:'documents', icon:FileText, path:'/documents', module:'documents' },
]

export default function Sidebar({ user }) {
  const nav = useNavigate()
  const loc = useLocation()
  const { hasModule, platformName } = useOrg()
  const [hoveredId, setHoveredId] = useState(null)
  const items = NAV.filter(i => !i.module || hasModule(i.module))

  return (
    <aside style={{
      width: 52, height: '100%', background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', flexShrink: 0,
      transition: 'width 0.2s ease'
    }}>
      {/* Logo mark */}
      <div style={{ marginBottom: 28, cursor: 'pointer' }} onClick={() => nav('/')}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)'
        }}>V</div>
      </div>

      {/* Nav items */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, width: '100%', padding: '0 6px' }}>
        {items.map(item => {
          const Icon = item.icon
          const active = loc.pathname === item.path || (item.path === '/' && loc.pathname === '/home')
          return (
            <div key={item.id} style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredId(item.id)} onMouseLeave={() => setHoveredId(null)}>
              <button onClick={() => nav(item.path)} style={{
                width: 40, height: 40, borderRadius: 'var(--radius-sm)', border: 'none',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-tertiary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s'
              }}>
                <Icon size={20} strokeWidth={1.8} />
              </button>
              {/* Tooltip */}
              {hoveredId === item.id && (
                <div style={{
                  position: 'absolute', left: 48, top: '50%', transform: 'translateY(-50%)',
                  background: 'var(--accent)', color: '#fff', padding: '4px 10px', borderRadius: 6,
                  fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', zIndex: 50,
                  animation: 'fadeIn 0.15s ease-out', fontFamily: 'var(--font)',
                  boxShadow: 'var(--shadow-md)'
                }}>{item.id.charAt(0).toUpperCase() + item.id.slice(1)}</div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom: Settings + avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 6px' }}>
        <button onClick={() => nav('/settings')} style={{
          width: 40, height: 40, borderRadius: 'var(--radius-sm)', border: 'none',
          background: loc.pathname === '/settings' ? 'var(--accent-soft)' : 'transparent',
          color: loc.pathname === '/settings' ? 'var(--text)' : 'var(--text-tertiary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
        }}><Settings size={20} strokeWidth={1.8} /></button>
        <button onClick={async () => { await supabase.auth.signOut(); nav('/login') }} style={{
          width: 28, height: 28, borderRadius: '50%', border: 'none',
          background: 'var(--accent-soft)', color: 'var(--text-tertiary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)', transition: 'all 0.15s'
        }}>{(user?.user_metadata?.full_name || user?.email || 'V')[0].toUpperCase()}</button>
      </div>
    </aside>
  )
}
