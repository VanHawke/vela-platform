// src/components/layout/LegoraTopNav.jsx
// Legora-style Option A top nav — replaces the previous dark-pill header.
// Reads navigation items from props so it stays compatible with the existing Layout's nav config.

import { useNavigate, useLocation } from 'react-router-dom'

const TABS = [
  { id: 'home',       label: 'Today',     path: '/',          showPlus: true },
  { id: 'pipeline',   label: 'Pipeline',  path: '/pipeline',  showPlus: true },
  { id: 'campaigns',  label: 'Campaigns', path: '/campaigns', showPlus: false },
  { id: 'inbox',      label: 'Inbox',     path: '/command-centre', showPlus: false },
  { id: 'calendar',   label: 'Calendar',  path: '/calendar',  showPlus: false },
  { id: 'insights',   label: 'Insights',  path: '/partnership-matrix', showPlus: false },
]

export default function LegoraTopNav({ user, customLogo, onSearchClick, onNotificationsClick, onNewClick, hasNotifications }) {
  const nav = useNavigate()
  const loc = useLocation()
  const initials = (user?.email || 'S').slice(0, 1).toUpperCase()

  const isActive = (path) => {
    if (path === '/') return loc.pathname === '/' || loc.pathname === '/home' || loc.pathname === '/dashboard'
    return loc.pathname === path || loc.pathname.startsWith(path + '/')
  }

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
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`ltn-link ${isActive(tab.path) ? 'active' : ''}`}
            onClick={() => nav(tab.path)}
          >
            {tab.label}
            {tab.showPlus && <span className="ltn-plus">+</span>}
          </button>
        ))}
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
          {hasNotifications && <span className="ltn-dot" />}
        </button>
        {onNewClick && (
          <button className="ltn-cta sparkle-cta magnetic" onClick={onNewClick}>+ New</button>
        )}
        <div className="ltn-avatar">{initials}</div>
      </div>
    </nav>
  )
}
