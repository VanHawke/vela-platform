// src/components/layout/RedesignTopNav.jsx
// Redesign v2 — 6-tab centred nav with icon+label pills
// Replaces LegoraTopNav on the redesign-v2 branch
// Preserves: permissions, avatar dropdown, search, sign out, unread badges
// Removes: background tasks, custom nav order (fixed 6 tabs), messenger shortcut (it's a tab now)

import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// Fixed 6-tab navigation — no reordering, no overflow
const TABS = [
  { id: 'home',               label: 'Today',              path: '/' },
  { id: 'pipeline',           label: 'Pipeline',           path: '/pipeline' },
  { id: 'records',            label: 'Records',            path: '/records' },
  { id: 'messages',           label: 'Messenger',          path: '/messages' },
  { id: 'campaigns',          label: 'Campaigns',          path: '/campaigns' },
  { id: 'partnership-matrix', label: 'Partnership Matrix',  path: '/partnership-matrix' },
]

// Tab icons (inline SVG paths)
const TAB_ICONS = {
  'home': (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  'pipeline': (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  'records': (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  'messages': (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  'campaigns': (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  'partnership-matrix': (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>,
}

export default function RedesignTopNav({ user, profile, customLogo, onSearchClick }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const avatarRef = useRef(null)

  // Unread messages badge — preserved from LegoraTopNav
  const [unreadMessages, setUnreadMessages] = useState(0)
  useEffect(() => {
    const handler = (e) => setUnreadMessages(e.detail?.count || 0)
    window.addEventListener('kiko_unread_messages', handler)
    return () => window.removeEventListener('kiko_unread_messages', handler)
  }, [])

  // Close avatar dropdown on outside click / escape
  useEffect(() => {
    const onDown = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') setAvatarOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc) }
  }, [])

  // Avatar source chain — preserved from LegoraTopNav
  const avatarUrl =
    profile?.profile_photo_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.identities?.[0]?.identity_data?.avatar_url ||
    user?.identities?.[0]?.identity_data?.picture ||
    null
  const initials = (profile?.display_name || profile?.first_name || user?.user_metadata?.full_name || user?.email || 'S').slice(0, 1).toUpperCase()

  const isActive = (path) => {
    if (path === '/') return loc.pathname === '/' || loc.pathname === '/home' || loc.pathname === '/dashboard'
    // Records tab should also highlight for /contacts and /organisations routes
    if (path === '/records') return loc.pathname === '/records' || loc.pathname.startsWith('/records/') || loc.pathname === '/contacts' || loc.pathname.startsWith('/contacts/') || loc.pathname === '/organisations' || loc.pathname.startsWith('/organisations/')
    // Campaigns tab should highlight for /campaigns/:id and /sequences/:id
    if (path === '/campaigns') return loc.pathname === '/campaigns' || loc.pathname.startsWith('/campaigns/') || loc.pathname.startsWith('/sequences/')
    return loc.pathname === path || loc.pathname.startsWith(path + '/')
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const handleTabClick = (tab) => {
    // Preserve kiko_nav_same_tab event — KikoChat depends on this
    if (isActive(tab.path)) {
      window.dispatchEvent(new CustomEvent('kiko_nav_same_tab', { detail: { path: tab.path, id: tab.id } }))
    }
    nav(tab.path)
  }

  return (
    <nav style={{
      height: 56,
      background: '#FFFFFF',
      borderBottom: '1px solid rgba(0,0,0,0.05)',
      padding: '0 20px',
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      flexShrink: 0,
      zIndex: 250,
    }}>
      {/* Brand — left */}
      <button
        onClick={() => handleTabClick(TABS[0])}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: '#0A0A0A', display: 'flex', alignItems: 'center',
        }}
      >
        {customLogo ? (
          <img src={customLogo} alt="Logo" style={{ height: 28 }} />
        ) : (
          <span style={{
            fontFamily: "'Source Serif 4', Georgia, serif",
            fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em',
          }}>Kiko</span>
        )}
      </button>

      {/* Centre tabs — icon + label pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {TABS.map(tab => {
          const active = isActive(tab.path)
          const color = active ? '#0A0A0A' : '#6B6B6B'
          const IconFn = TAB_ICONS[tab.id]
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 24,
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 500 : 450,
                fontFamily: "'Inter', system-ui, sans-serif",
                background: active ? 'rgba(0,0,0,0.06)' : 'transparent',
                color: color,
                transition: 'all 0.12s ease',
                position: 'relative',
              }}
            >
              {IconFn && IconFn(color)}
              {tab.label}
              {tab.id === 'messages' && unreadMessages > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 4,
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#E8700A',
                }} />
              )}
            </button>
          )
        })}

        {/* Settings in a subtle link after tabs */}
        <button
          onClick={() => nav('/settings')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', borderRadius: 24,
            border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 450,
            fontFamily: "'Inter', system-ui, sans-serif",
            background: isActive('/settings') ? 'rgba(0,0,0,0.06)' : 'transparent',
            color: isActive('/settings') ? '#0A0A0A' : '#A0A0A0',
            transition: 'all 0.12s ease', marginLeft: 4,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* Right cluster — search + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
        {/* Search */}
        <button
          onClick={onSearchClick}
          title="Search"
          style={{
            width: 32, height: 32, background: 'none', border: 'none',
            cursor: 'pointer', display: 'grid', placeItems: 'center',
            borderRadius: 4, color: '#6B6B6B',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = '#0A0A0A' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#6B6B6B' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Avatar with dropdown */}
        <div ref={avatarRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setAvatarOpen(o => !o)}
            title={user?.email || ''}
            className="ltn-avatar"
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#0A0A0A', border: 'none', cursor: 'pointer',
              display: 'grid', placeItems: 'center', overflow: 'hidden',
              padding: 0,
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl} alt=""
                referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 500, fontFamily: "'Inter', system-ui, sans-serif" }}>{initials}</span>
            )}
          </button>
          {avatarOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              minWidth: 200, background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8,
              boxShadow: '0 12px 32px rgba(0,0,0,0.10)', padding: '4px 0',
              zIndex: 1000,
            }}>
              {user?.email && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A' }}>
                    {user?.user_metadata?.full_name || 'User'}
                  </div>
                  <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2 }}>{user.email}</div>
                </div>
              )}
              <button
                onClick={() => { nav('/settings'); setAvatarOpen(false) }}
                style={{
                  display: 'block', width: '100%', padding: '8px 14px',
                  background: 'none', border: 'none', textAlign: 'left',
                  fontSize: 13, color: '#0A0A0A', cursor: 'pointer',
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >Settings</button>
              <div style={{ height: 1, background: 'rgba(0,0,0,0.05)', margin: '4px 0' }} />
              <button
                onClick={handleSignOut}
                style={{
                  display: 'block', width: '100%', padding: '8px 14px',
                  background: 'none', border: 'none', textAlign: 'left',
                  fontSize: 13, color: '#B8643E', cursor: 'pointer',
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >Sign out</button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
