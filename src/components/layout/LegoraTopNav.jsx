// src/components/layout/LegoraTopNav.jsx
// Legora-style top nav — main tabs + More dropdown + avatar dropdown

import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { usePagePermissions } from '@/lib/usePagePermissions'

// Master list of all navigable pages. Top nav vs More is controlled by Settings → Navigation.
const ALL_PAGES = [
  { id: 'home',                label: 'Today',              path: '/',                   showPlus: false, aliases: ['home', 'today', 'dashboard'], pageKey: null },
  { id: 'pipeline',            label: 'Pipeline',           path: '/pipeline',           showPlus: false, aliases: ['pipeline'],                    pageKey: 'pipeline' },
  { id: 'campaigns',           label: 'Campaigns',          path: '/campaigns',          showPlus: false, aliases: ['campaigns', 'sequences'],      pageKey: 'campaigns' },
  { id: 'messages',            label: 'Messages',           path: '/messages',           showPlus: false, aliases: ['messages', 'chat', 'team'],    pageKey: null },
  { id: 'command-centre',      label: 'Command Centre',     path: '/command-centre',     showPlus: false, aliases: ['command-centre', 'inbox'],     pageKey: 'command_centre' },
  { id: 'calendar',            label: 'Calendar',           path: '/calendar',           showPlus: false, aliases: ['calendar'],                    pageKey: 'race_calendar' },
  { id: 'contacts',            label: 'Contacts',           path: '/contacts',           showPlus: false, aliases: ['contacts'],                    pageKey: 'contacts' },
  { id: 'organisations',       label: 'Organisations',      path: '/organisations',      showPlus: false, aliases: ['organisations', 'orgs', 'companies'], pageKey: 'organisations' },
  { id: 'partnership-matrix',  label: 'Partnership Matrix', path: '/partnership-matrix', showPlus: false, aliases: ['partnership-matrix', 'insights'], pageKey: 'partnership_matrix' },
  { id: 'documents',           label: 'Document Library',   path: '/documents',          showPlus: false, aliases: ['documents', 'library', 'docs'], pageKey: null },
]
const DEFAULT_TOP_IDS = ALL_PAGES.map(p => p.id)
// Settings is pinned to More dropdown, never in top nav
const DEFAULT_TOP_PAGES = DEFAULT_TOP_IDS.map(id => ALL_PAGES.find(p => p.id === id)).filter(Boolean)
const SETTINGS_ITEM = { id: 'settings', label: 'Settings', path: '/settings', divider: true }


export default function LegoraTopNav({ user, profile, customLogo, onSearchClick, onNotificationsClick, onNewClick, hasNotifications, notifCount = 0, isAdmin = false }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [bgTasks, setBgTasks] = useState([])
  const moreRef = useRef(null)
  const avatarRef = useRef(null)
  const tasksRef = useRef(null)

  // Fetch background tasks — Realtime subscription + fallback poll
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const { data } = await supabase.from('kiko_background_jobs').select('id,title,status,job_type,result,queued_at,finished_at,related_entity_id,progress_pct,progress_message').order('queued_at', { ascending: false }).limit(10)
        setBgTasks(data || [])
      } catch {}
    }
    loadTasks()
    // Realtime subscription — instant updates when any job changes
    const channel = supabase.channel('bg-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_background_jobs' }, () => loadTasks())
      .subscribe()
    // Fallback poll every 30s for safety
    const interval = setInterval(loadTasks, 30000)
    // Listen for immediate refresh requests
    const onRefresh = () => loadTasks()
    window.addEventListener('kiko_refresh_tasks', onRefresh)
    return () => { supabase.removeChannel(channel); clearInterval(interval); window.removeEventListener('kiko_refresh_tasks', onRefresh) }
  }, [])

  // Close tasks dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (tasksRef.current && !tasksRef.current.contains(e.target)) setTasksOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Permission resolver — hides tabs the user can't access
  const orgId = user?.app_metadata?.org_id
  const { canSee } = usePagePermissions(user, orgId)

  // Avatar source chain: user-uploaded profile photo first, then Google avatar, then nothing
  const avatarUrl =
    profile?.profile_photo_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.identities?.[0]?.identity_data?.avatar_url ||
    user?.identities?.[0]?.identity_data?.picture ||
    null
  const initials = (profile?.display_name || profile?.first_name || user?.user_metadata?.full_name || user?.email || 'S').slice(0, 1).toUpperCase()

  // Close dropdowns on outside click / escape
  useEffect(() => {
    const onDown = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') { setMoreOpen(false); setAvatarOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc) }
  }, [])

  const isActive = (path) => {
    if (path === '/') return loc.pathname === '/' || loc.pathname === '/home' || loc.pathname === '/dashboard'
    return loc.pathname === path || loc.pathname.startsWith(path + '/')
  }

  // Read custom nav order from Settings (localStorage 'kiko_top_nav_v2')
  const [orderedTabs, setOrderedTabs] = useState(() => {
    try {
      const stored = localStorage.getItem('kiko_top_nav_v2')
      if (!stored) return DEFAULT_TOP_PAGES
      const ids = JSON.parse(stored)
      const resolved = ids.map(id => ALL_PAGES.find(t => t.id === id || (t.aliases && t.aliases.includes(id)))).filter(Boolean)
      if (!resolved.some(t => t.id === 'home')) { const h = ALL_PAGES.find(t => t.id === 'home'); if (h) resolved.unshift(h) }
      return resolved.length > 0 ? resolved : DEFAULT_TOP_PAGES
    } catch { return DEFAULT_TOP_PAGES }
  })
  const [moreOrder, setMoreOrder] = useState(() => {
    try { const s = localStorage.getItem('kiko_more_order'); return s ? JSON.parse(s) : null } catch { return null }
  })
  useEffect(() => {
    // ── Force-clean stale 'linkedin' from saved nav order ──
    try {
      ['kiko_top_nav_v2', 'kiko_nav_order', 'kiko_more_order'].forEach(key => {
        const raw = localStorage.getItem(key)
        if (raw && raw.includes('linkedin')) {
          const arr = JSON.parse(raw).filter(id => id !== 'linkedin')
          localStorage.setItem(key, JSON.stringify(arr))
        }
      })
    } catch {}
    const applyOrder = () => {
      try {
        const stored = localStorage.getItem('kiko_top_nav_v2')
        if (!stored) { setOrderedTabs(DEFAULT_TOP_PAGES); return }
        const ids = JSON.parse(stored)
        if (!Array.isArray(ids) || ids.length === 0) { setOrderedTabs(DEFAULT_TOP_PAGES); return }
        // Resolve stored IDs to TAB entries using aliases, preserve user's order.
        // NO append-missing — if user toggled a tab off in Settings, it stays OFF.
        // (Previously we appended all missing pages to the end, which made reorder
        //  look broken — tabs the user removed kept reappearing.)
        const resolved = ids
          .map(id => ALL_PAGES.find(t => t.id === id || (t.aliases && t.aliases.includes(id))))
          .filter(Boolean)
        // Always ensure home is present (it's required — can't be toggled off in UI)
        if (!resolved.some(t => t.id === 'home')) {
          const homeTab = ALL_PAGES.find(t => t.id === 'home')
          if (homeTab) resolved.unshift(homeTab)
        }
        setOrderedTabs(resolved)
      } catch { setOrderedTabs(DEFAULT_TOP_PAGES) }
    }
    applyOrder()
    // Also load from Supabase in case localStorage was cleared
    supabase.from('kiko_user_config').select('nav_settings').limit(1).single().then(({ data }) => {
      if (data?.nav_settings?.kiko_top_nav_v2) {
        localStorage.setItem('kiko_top_nav_v2', JSON.stringify(data.nav_settings.kiko_top_nav_v2))
        applyOrder() // re-apply with Supabase data now in localStorage
      }
    }).catch(() => {})
    const onUpdate = () => applyOrder()
    const onMoreUpdate = () => {
      try { const s = localStorage.getItem('kiko_more_order'); setMoreOrder(s ? JSON.parse(s) : null) } catch {}
    }
    window.addEventListener('kiko_top_nav_updated', onUpdate)
    window.addEventListener('kiko_more_order_updated', onMoreUpdate)
    window.addEventListener('storage', onUpdate)
    window.addEventListener('storage', onMoreUpdate)
    return () => {
      window.removeEventListener('kiko_top_nav_updated', onUpdate)
      window.removeEventListener('kiko_more_order_updated', onMoreUpdate)
      window.removeEventListener('storage', onUpdate)
      window.removeEventListener('storage', onMoreUpdate)
    }
  }, [])

  // Unread messages badge
  const [unreadMessages, setUnreadMessages] = useState(0)
  useEffect(() => {
    const handler = (e) => setUnreadMessages(e.detail?.count || 0)
    window.addEventListener('kiko_unread_messages', handler)
    return () => window.removeEventListener('kiko_unread_messages', handler)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Tabs not in the user's top-nav list should fall through to the More dropdown.
  // IMPORTANT: This must be declared AFTER `orderedTabs` useState (TDZ) — it reads orderedTabs.
  const overflowTabsRaw = ALL_PAGES.filter(t => !orderedTabs.some(o => o.id === t.id))
    .filter(t => !t.pageKey || canSee(t.pageKey))
  // Apply user's More-order preference (from Settings → Navigation → More Dropdown Order)
  const overflowTabs = moreOrder && moreOrder.length > 0
    ? [...overflowTabsRaw].sort((a, b) => {
        const ai = moreOrder.indexOf(a.id); const bi = moreOrder.indexOf(b.id)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    : overflowTabsRaw

  const moreIsActive = [SETTINGS_ITEM].some(m => isActive(m.path)) || overflowTabs.some(t => isActive(t.path))
  const visibleMoreItems = [
    ...overflowTabs.map(t => ({ id: t.id, label: t.label, path: t.path, pageKey: t.pageKey })),
    ...[SETTINGS_ITEM].filter(m => {
      if (m.adminOnly && !isAdmin) return false
      if (m.pageKey && !canSee(m.pageKey)) return false
      return true
    }).map((m, idx, arr) => {
      // Ensure Settings always has divider when anything else is above it
      if (m.id === 'settings' && (overflowTabs.length > 0 || arr.length > 1)) {
        return { ...m, divider: true }
      }
      return m
    }),
  ]


  return (
    <nav className="legora-topnav legora-top-nav-desktop">
      {/* Brand */}
      <button className="ltn-brand" onClick={() => { try { nav('/') } catch { window.location.href = '/' } }}>
        {customLogo ? (
          <img src={customLogo} alt="Logo" className="ltn-logo" />
        ) : (
          <span className="ltn-name">Kiko</span>
        )}
      </button>

      {/* Center nav */}
      <div className="ltn-links">
        {orderedTabs.filter(tab => !tab.pageKey || canSee(tab.pageKey)).map(tab => (
          <button
            key={tab.id}
            className={`ltn-link ${isActive(tab.path) ? 'active' : ''}`}
            onClick={() => {
              // If user clicks a nav item for the page they're already on (e.g. "Today" while
              // the chat pane is covering home), dispatch an event so page can reset state.
              if (isActive(tab.path)) {
                window.dispatchEvent(new CustomEvent('kiko_nav_same_tab', { detail: { path: tab.path, id: tab.id } }))
              }
              nav(tab.path)
            }}
          >
            {tab.label}
            {tab.id === 'messages' && unreadMessages > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, borderRadius: 8, background: '#E8700A', color: '#fff', fontSize: 9, fontWeight: 700, padding: '0 4px', marginLeft: 5 }}>{unreadMessages}</span>
            )}
            {tab.showPlus && <span className="ltn-plus">+</span>}
          </button>
        ))}

        {/* More dropdown */}
        <div className="ltn-more-wrap" ref={moreRef}>
          <button
            className={`ltn-link ${moreIsActive ? 'active' : ''}`}
            onClick={() => setMoreOpen(o => !o)}
            aria-expanded={moreOpen}
          >
            More
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4 }}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {moreOpen && (
            <div className="ltn-dropdown">
              {visibleMoreItems.map(item => (
                <div key={item.id}>
                  {item.divider && <div className="ltn-dropdown-divider" />}
                  <button
                    className={`ltn-dropdown-item ${isActive(item.path) ? 'active' : ''}`}
                    onClick={() => { nav(item.path); setMoreOpen(false) }}
                  >
                    {item.label}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* Right cluster */}
      <div className="ltn-right">
        {/* Search */}
        <button className="ltn-icon" onClick={onSearchClick} title="Search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        {/* Messages shortcut */}
        <button className="ltn-icon" onClick={() => nav('/messages')} title="Messages" style={{ position: 'relative' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          {unreadMessages > 0 && (
            <span className="ltn-dot" style={{ background: '#E8700A' }}>{unreadMessages > 9 ? '9+' : unreadMessages}</span>
          )}
        </button>
        <div ref={tasksRef} style={{ position: 'relative' }}>
          <button className="ltn-icon" onClick={() => setTasksOpen(!tasksOpen)} title="Background tasks">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: bgTasks.filter(t => t.status === 'queued' || t.status === 'processing').length > 0 ? 1 : 0.6 }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            {bgTasks.filter(t => t.status === 'queued' || t.status === 'processing').length > 0 && (
              <span className="ltn-dot" style={{ background: '#7C5CFC' }}>{bgTasks.filter(t => t.status === 'queued' || t.status === 'processing').length}</span>
            )}
          </button>
          {tasksOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 340, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 420, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500, fontSize: 13, color: '#0A0A0A' }}>Background Tasks</span>
                {bgTasks.length > 0 && <button onClick={async () => { const ids = bgTasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled').map(t => t.id); for (const id of ids) { await supabase.from('kiko_background_jobs').delete().eq('id', id) }; setBgTasks(prev => prev.filter(t => t.status === 'queued' || t.status === 'processing')) }} style={{ fontSize: 10, color: '#A0A0A0', background: 'none', border: 'none', cursor: 'pointer' }}>Clear finished</button>}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {bgTasks.length === 0 && <div style={{ padding: '24px 16px', textAlign: 'center', color: '#A0A0A0', fontSize: 12 }}>No background tasks</div>}
                {bgTasks.map(t => {
                  const isActive = t.status === 'queued' || t.status === 'processing'
                  const isCompleted = t.status === 'completed'
                  const isFailed = t.status === 'failed'
                  const elapsed = t.queued_at ? Math.round((Date.now() - new Date(t.queued_at).getTime()) / 60000) : 0
                  return (<div key={t.id} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10 }}>{isCompleted ? '✅' : isActive ? '⏳' : isFailed ? '❌' : '○'}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#0A0A0A', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    </div>
                    {isActive && <div style={{ marginBottom: 4 }}>
                      <div style={{ width: '100%', height: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}><div style={{ width: `${t.progress_pct || (t.status === 'processing' ? 50 : 10)}%`, height: '100%', background: '#7C5CFC', borderRadius: 2, transition: 'width 1s' }} /></div>
                      <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 3, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.progress_message || (t.status === 'processing' ? 'Processing...' : 'Queued')} · {elapsed}m</span>
                        <button onClick={async (e) => { e.stopPropagation(); await supabase.from('kiko_background_jobs').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', t.id); setBgTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: 'cancelled' } : x)) }} style={{ fontSize: 10, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
                      </div>
                    </div>}
                    {isCompleted && <div>
                      <div style={{ fontSize: 10, color: '#6B6B6B' }}>{t.result ? (t.result.emails_found != null ? `${t.result.emails_found}/${t.result.total || '?'} emails found` : t.result.targets_added != null ? `${t.result.targets_added} targets, ${t.result.enrolled || 0} enrolled` : t.result.prospects_found != null ? `${t.result.prospects_found} prospects` : t.result.title || 'Done') : 'Done'} · {new Date(t.queued_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                        {t.related_entity_id && <button onClick={() => { nav(`/campaigns/${t.related_entity_id}`); setTasksOpen(false) }} style={{ fontSize: 10, color: '#7C5CFC', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>View campaign →</button>}
                        <button onClick={async (e) => { e.stopPropagation(); await supabase.from('kiko_background_jobs').delete().eq('id', t.id); setBgTasks(prev => prev.filter(x => x.id !== t.id)) }} style={{ fontSize: 10, color: '#A0A0A0', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                      </div>
                    </div>}
                    {isFailed && <div>
                      <div style={{ fontSize: 10, color: '#f87171', marginBottom: 3 }}>{t.error_message?.slice(0, 80) || 'Failed'}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={async (e) => { e.stopPropagation(); await supabase.from('kiko_background_jobs').update({ status: 'queued', started_at: null, finished_at: null, error_message: null }).eq('id', t.id); setBgTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: 'queued' } : x)) }} style={{ fontSize: 10, color: '#7C5CFC', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>Retry</button>
                        <button onClick={async (e) => { e.stopPropagation(); await supabase.from('kiko_background_jobs').delete().eq('id', t.id); setBgTasks(prev => prev.filter(x => x.id !== t.id)) }} style={{ fontSize: 10, color: '#A0A0A0', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                      </div>
                    </div>}
                    {t.status === 'cancelled' && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#A0A0A0' }}>Cancelled</span>
                      <button onClick={async (e) => { e.stopPropagation(); await supabase.from('kiko_background_jobs').delete().eq('id', t.id); setBgTasks(prev => prev.filter(x => x.id !== t.id)) }} style={{ fontSize: 10, color: '#A0A0A0', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                    </div>}
                  </div>)
                })}
              </div>
            </div>
          )}
        </div>


        {/* Avatar with dropdown */}
        <div className="ltn-avatar-wrap" ref={avatarRef}>
          <button className="ltn-avatar" onClick={() => setAvatarOpen(o => !o)} title={user?.email || ''}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // Image load failed — hide img and reveal initials fallback
                  e.currentTarget.style.display = 'none'
                  const parent = e.currentTarget.parentElement
                  if (parent) parent.classList.add('ltn-avatar-fallback')
                }}
              />
            ) : (
              <span className="ltn-avatar-initials">{initials}</span>
            )}
          </button>
          {avatarOpen && (
            <div className="ltn-dropdown ltn-dropdown-right">
              {user?.email && (
                <div className="ltn-dropdown-header">
                  <div className="ltn-dropdown-name">{user?.user_metadata?.full_name || 'User'}</div>
                  <div className="ltn-dropdown-email">{user.email}</div>
                </div>
              )}
              <button className="ltn-dropdown-item" onClick={() => { nav('/settings'); setAvatarOpen(false) }}>Settings</button>
              <div className="ltn-dropdown-divider" />
              <button className="ltn-dropdown-item ltn-dropdown-danger" onClick={handleSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
