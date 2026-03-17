import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Home, Users, Building2, GitBranch, Diamond, Mail, Newspaper, Grid3X3, Calendar, FileText, CheckSquare, Settings, LogOut, User } from 'lucide-react'

const ICON_MAP = { Home, Users, Building2, GitBranch, Diamond, Mail, Newspaper, Grid3X3, Calendar, FileText, CheckSquare }
const NAV_DEFAULTS = [
  { id: 'home', label: 'Home', icon: 'Home', path: '/' },
  { id: 'contacts', label: 'Contacts', icon: 'Users', path: '/contacts' },
  { id: 'organisations', label: 'Organisations', icon: 'Building2', path: '/organisations' },
  { id: 'pipeline', label: 'Deal Pipeline', icon: 'GitBranch', path: '/pipeline' },
  { id: 'email', label: 'Email', icon: 'Mail', path: '/email' },
  { id: 'news', label: 'News', icon: 'Newspaper', path: '/news' },
  { id: 'partnership-matrix', label: 'Matrix', icon: 'Grid3X3', path: '/partnership-matrix' },
  { id: 'calendar', label: 'Calendar', icon: 'Calendar', path: '/calendar' },
  { id: 'documents', label: 'Library', icon: 'FileText', path: '/documents' },
  { id: 'tasks', label: 'Tasks', icon: 'CheckSquare', path: '/tasks' },
]

const W_COLLAPSED = 44
const W_EXPANDED = 200

export default function Sidebar({ logoIcon, logoExpanded, user, onHomeClick }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [expanded, setExpanded] = useState(false)
  const [navItems, setNavItems] = useState(NAV_DEFAULTS)
  const [profile, setProfile] = useState({})

  useEffect(() => {
    if (!user?.id) return
    const load = () => {
      supabase.from('user_settings').select('first_name, last_name, display_name, profile_photo_url, role_title')
        .eq('user_id', user.id).single()
        .then(({ data }) => { if (data) setProfile(data) })
    }
    load()
    window.addEventListener('vela_profile_updated', load)
    return () => window.removeEventListener('vela_profile_updated', load)
  }, [user?.id])

  useEffect(() => {
    const loadOrder = () => {
      try {
        const stored = localStorage.getItem('vela_nav_order')
        if (stored) {
          const order = JSON.parse(stored)
          const ordered = order.map(o => NAV_DEFAULTS.find(n => n.id === o.id)).filter(Boolean)
          const missing = NAV_DEFAULTS.filter(n => !order.find(o => o.id === n.id))
          setNavItems([...ordered, ...missing])
        }
      } catch {}
    }
    loadOrder()
    window.addEventListener('vela_nav_updated', loadOrder)
    return () => window.removeEventListener('vela_nav_updated', loadOrder)
  }, [])

  const isActive = (path) => loc.pathname === path || (path === '/' && loc.pathname === '/home')
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
        borderRight: '0.5px solid var(--border)',
        boxShadow: '2px 0 20px rgba(0,0,0,0.04), inset -1px 0 0 rgba(255,255,255,0.5)',
        display: 'flex', flexDirection: 'column', padding: '16px 0',
        flexShrink: 0,
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden', zIndex: 50,
      }}>
      <div style={{ padding: '0 8px', marginBottom: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', height: 36 }} onClick={() => { if (onHomeClick) onHomeClick(); nav('/') }}>
        {expanded ? (
          // Expanded: show wide rectangle logo if set, else fall back to icon or V badge
          logoExpanded ? (
            <img src={logoExpanded} alt="" style={{ height: 26, maxWidth: 160, objectFit: 'contain', transition: 'opacity 0.2s' }} />
          ) : logoIcon ? (
            <img src={logoIcon} alt="" style={{ height: 28, width: 28, objectFit: 'contain', borderRadius: 6 }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)', flexShrink: 0 }}>V</div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font)' }}>Vela</span>
            </div>
          )
        ) : (
          // Collapsed: show square icon logo if set, else V badge
          logoIcon ? (
            <img src={logoIcon} alt="" style={{ height: 28, width: 28, objectFit: 'contain', borderRadius: 6 }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)', flexShrink: 0 }}>V</div>
          )
        )}
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, padding: '0 8px' }}>
        {navItems.map(item => {
          const Icon = typeof item.icon === 'string' ? ICON_MAP[item.icon] : item.icon
          if (!Icon) return null
          const active = isActive(item.path)
          return (
            <button key={item.id} onClick={() => { if (item.id === 'home' && onHomeClick) onHomeClick(); nav(item.path) }} style={{ height: 34, borderRadius: 8, border: 'none', padding: '0 7px', background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s', overflow: 'hidden', whiteSpace: 'nowrap' }}
              onMouseOver={e => { if (!active) e.currentTarget.style.background = 'var(--accent-soft)' }}
              onMouseOut={e => { e.currentTarget.style.background = active ? 'var(--accent-soft)' : 'transparent' }}>
              <Icon size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              {expanded && <span style={{ fontSize: 13, fontWeight: active ? 500 : 400, fontFamily: 'var(--font)' }}>{item.label}</span>}
            </button>
          )
        })}
      </nav>
      <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* User profile mini-card */}
        <button onClick={() => nav('/settings')} style={{ height: expanded ? 44 : 34, borderRadius: 8, border: 'none', padding: '0 7px', width: '100%', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s', whiteSpace: 'nowrap', marginBottom: 4 }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--accent-soft)'}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
          {profile.profile_photo_url ? (
            <div style={{ width: expanded ? 28 : 20, height: expanded ? 28 : 20, minWidth: expanded ? 28 : 20, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, transition: 'all 0.2s' }}>
              <img src={profile.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          ) : (
            <div style={{ width: expanded ? 28 : 20, height: expanded ? 28 : 20, minWidth: expanded ? 28 : 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
              <User size={expanded ? 14 : 11} color="#fff" strokeWidth={2} />
            </div>
          )}
          {expanded && (
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : (profile.display_name || user?.email?.split('@')[0] || 'User')}
              </div>
              {profile.role_title && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.role_title}</div>}
            </div>
          )}
        </button>
        <div style={{ height: 1, background: 'var(--border)', margin: '0 4px 4px' }} />
        <button onClick={() => nav('/settings')} style={{ height: 34, borderRadius: 8, border: 'none', padding: '0 7px', width: '100%', background: loc.pathname === '/settings' ? 'var(--accent-soft)' : 'transparent', color: loc.pathname === '/settings' ? 'var(--text)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <Settings size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          {expanded && <span style={{ fontSize: 13, fontFamily: 'var(--font)' }}>Settings</span>}
        </button>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }} style={{ height: 34, borderRadius: 8, border: 'none', padding: '0 7px', width: '100%', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s', overflow: 'hidden', whiteSpace: 'nowrap' }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,59,48,0.06)'}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
          <LogOut size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          {expanded && <span style={{ fontSize: 13, fontFamily: 'var(--font)', color: '#FF3B30' }}>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
