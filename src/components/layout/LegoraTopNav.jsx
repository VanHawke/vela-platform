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
  { id: 'command-centre',      label: 'Command Centre',     path: '/command-centre',     showPlus: false, aliases: ['command-centre', 'inbox'],     pageKey: 'command_centre' },
  { id: 'calendar',            label: 'Calendar',           path: '/calendar',           showPlus: false, aliases: ['calendar'],                    pageKey: 'race_calendar' },
  { id: 'contacts',            label: 'Contacts',           path: '/contacts',           showPlus: false, aliases: ['contacts'],                    pageKey: 'contacts' },
  { id: 'organisations',       label: 'Organisations',      path: '/organisations',      showPlus: false, aliases: ['organisations', 'orgs', 'companies'], pageKey: 'organisations' },
  { id: 'partnership-matrix',  label: 'Partnership Matrix', path: '/partnership-matrix', showPlus: false, aliases: ['partnership-matrix', 'insights'], pageKey: 'partnership_matrix' },
  { id: 'linkedin',            label: 'LinkedIn',           path: '/linkedin',           showPlus: false, aliases: ['linkedin'],                    pageKey: 'linkedin_queue' },
]
// Default top-nav IDs (everything except LinkedIn which defaults to More)
const DEFAULT_TOP_IDS = ALL_PAGES.filter(p => p.id !== 'linkedin').map(p => p.id)
// Settings is pinned to More dropdown, never in top nav
const DEFAULT_TOP_PAGES = DEFAULT_TOP_IDS.map(id => ALL_PAGES.find(p => p.id === id)).filter(Boolean)
const SETTINGS_ITEM = { id: 'settings', label: 'Settings', path: '/settings', divider: true }


export default function LegoraTopNav({ user, profile, customLogo, onSearchClick, onNotificationsClick, onNewClick, hasNotifications, notifCount = 0, isAdmin = false }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const moreRef = useRef(null)
  const avatarRef = useRef(null)

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
  const [orderedTabs, setOrderedTabs] = useState(DEFAULT_TOP_PAGES)
  const [moreOrder, setMoreOrder] = useState(() => {
    try { const s = localStorage.getItem('kiko_more_order'); return s ? JSON.parse(s) : null } catch { return null }
  })
  useEffect(() => {
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
    <nav className="legora-topnav">
      {/* Brand */}
      <button className="ltn-brand" onClick={() => nav('/')}>
        {customLogo ? (
          <img src={customLogo} alt="Logo" className="ltn-logo" />
        ) : (
          <>
            <svg className="ltn-mark" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.5 7.5L21 11l-7.5 1.5L12 20l-1.5-7.5L3 11l7.5-1.5L12 2z" />
            </svg>
            <span className="ltn-name">Kiko</span>
          </>
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
        <button className="ltn-icon" onClick={onSearchClick} title="Search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button className="ltn-icon" onClick={onNotificationsClick} title="Notifications">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          {hasNotifications && <span className="ltn-dot">{notifCount > 0 && notifCount <= 99 ? notifCount : notifCount > 99 ? '99+' : ''}</span>}
        </button>
        {onNewClick && (
          <button className="ltn-cta sparkle-cta magnetic" onClick={onNewClick}>+ New</button>
        )}

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
