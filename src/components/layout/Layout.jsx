// src/components/layout/Layout.jsx — REBUILT clean (Block C)
// Same structure: top bar (logo / pill nav / avatar), main outlet, KikoFloat, mobile nav.
// Every color from tokens.js — zero hardcoded values.
import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import { t } from '@/lib/tokens'
import {
  Settings as SettingsIcon, LogOut, ChevronDown, Home, GitBranch,
  Calendar, Users, Building2, Target, Grid3X3, Zap, Menu, X, MoreHorizontal,
} from 'lucide-react'
import KikoFloat from '../kiko/KikoFloat'
import KikoToast from '../kiko/KikoToast'
import CommandPalette from './CommandPalette'

const ALL_NAV = [
  { id: 'home', label: 'Home', path: '/', Icon: Home },
  { id: 'pipeline', label: 'Pipeline', path: '/pipeline', Icon: GitBranch },
  { id: 'calendar', label: 'Race Calendar', path: '/calendar', Icon: Calendar },
  { id: 'contacts', label: 'Contacts', path: '/contacts', Icon: Users },
  { id: 'organisations', label: 'Organisations', path: '/organisations', Icon: Building2 },
  { id: 'command-centre', label: 'Command Centre', path: '/command-centre', Icon: Target },
  { id: 'partnership-matrix', label: 'Partnership Matrix', path: '/partnership-matrix', Icon: Grid3X3 },
  { id: 'sequences', label: 'Campaigns', path: '/sequences', Icon: Zap },
]
const DEFAULT_TOP_IDS = ['home', 'command-centre', 'pipeline', 'partnership-matrix']

function getTopNavIds() {
  try {
    const s = localStorage.getItem('kiko_top_nav')
    if (s) {
      const ids = JSON.parse(s)
      const valid = new Set(ALL_NAV.map(n => n.id))
      const cleaned = ids.filter(id => valid.has(id))
      return cleaned.length > 0 ? cleaned : DEFAULT_TOP_IDS
    }
  } catch {}
  return DEFAULT_TOP_IDS
}

export default function Layout({ user }) {
  const loc = useLocation()
  const nav = useNavigate()
  const isHome = loc.pathname === '/' || loc.pathname === '/home'

  const [profile, setProfile] = useState({})
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [topNavIds, setTopNavIds] = useState(getTopNavIds)
  const [kikoMessages, setKikoMessages] = useState([])
  const [kikoConvId, setKikoConvId] = useState(null)
  const [kikoResetKey, setKikoResetKey] = useState(0)
  const [customLogo, setCustomLogo] = useState(null)

  const moreRef = useRef(null)
  const avatarRef = useRef(null)

  // Load profile + custom logo
  useEffect(() => {
    if (!user?.id) return
    ;(async () => {
      const { data } = await supabase.from('kiko_user_config').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle()
      if (data) setProfile(data)
    })()
    try {
      const stored = localStorage.getItem('custom_logo_url')
      if (stored) setCustomLogo(stored)
    } catch {}
    const logoHandler = () => { try { const s = localStorage.getItem('custom_logo_url'); setCustomLogo(s || null) } catch {} }
    window.addEventListener('kiko_logo_updated', logoHandler)
    return () => window.removeEventListener('kiko_logo_updated', logoHandler)
  }, [user?.id])

  // Listen for nav updates from Settings
  useEffect(() => {
    const handler = () => setTopNavIds(getTopNavIds())
    window.addEventListener('kiko_top_nav_updated', handler)
    return () => window.removeEventListener('kiko_top_nav_updated', handler)
  }, [])

  // Click outside handlers
  useEffect(() => {
    const onClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const kikoNavigate = useCallback((page) => nav(page === 'home' ? '/' : `/${page}`), [nav])

  // Voice navigation
  useEffect(() => {
    const handler = (e) => { if (e.detail?.page) kikoNavigate(e.detail.page) }
    window.addEventListener('kiko_navigate', handler)
    return () => window.removeEventListener('kiko_navigate', handler)
  }, [kikoNavigate])

  // Cmd+K palette
  useEffect(() => {
    const handler = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(true) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const TABS = topNavIds.map(id => ALL_NAV.find(n => n.id === id)).filter(Boolean)
  const moreItems = ALL_NAV.filter(n => !topNavIds.includes(n.id))
  const isTabActive = (path) => path === '/' ? isHome : loc.pathname === path

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw',
      overflow: 'hidden', background: t.bg, color: t.fg, fontFamily: t.fontSans,
    }}>
      {/* ─── Top bar ─── */}
      <header style={{
        height: 56, minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', background: t.bg, borderBottom: `1px solid ${t.border}`,
        flexShrink: 0, position: 'relative', zIndex: 250,
      }}>
        {/* Left: Logo */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1); nav('/') }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {customLogo ? (
              <img src={customLogo} alt="Logo" style={{ height: 36, borderRadius: 8, maxWidth: 160, objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 15, fontWeight: 600, color: t.fg, fontFamily: t.fontSans, letterSpacing: '0.12em' }}>
                VAN HAWKE<sup style={{ fontSize: 8, verticalAlign: 'super', opacity: 0.5 }}>™</sup>
              </span>
            )}
          </button>
        </div>

        {/* Center: Pill nav */}
        <div className="desktop-top-nav" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{
            display: 'flex', gap: 3, background: t.muted, borderRadius: 14, padding: 4,
            border: `1px solid ${t.border}`, boxShadow: t.shadowSm,
          }}>
            {TABS.map(tab => {
              const active = isTabActive(tab.path)
              return (
                <button key={tab.path} onClick={() => {
                  if (tab.path === '/') { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1) }
                  nav(tab.path)
                }} style={{
                  padding: '7px 22px', borderRadius: 999, border: 'none',
                  background: active ? t.primary : 'transparent',
                  color: active ? t.primaryFg : t.mutedFg,
                  fontSize: 13, fontWeight: active ? 500 : 400, cursor: 'pointer', fontFamily: t.fontSans,
                  transition: 'all 0.15s',
                }}
                  onMouseOver={e => { if (!active) { e.currentTarget.style.color = t.fg; e.currentTarget.style.background = t.accent } }}
                  onMouseOut={e => { if (!active) { e.currentTarget.style.color = t.mutedFg; e.currentTarget.style.background = 'transparent' } }}
                >{tab.label}</button>
              )
            })}
            {/* More dropdown */}
            <div ref={moreRef} style={{ position: 'relative' }}>
              <button onClick={() => setMoreOpen(!moreOpen)} style={{
                padding: '7px 18px', borderRadius: 999, border: 'none',
                background: moreOpen ? t.accent : 'transparent',
                color: moreOpen ? t.fg : t.mutedFg,
                fontSize: 13, fontWeight: 400, cursor: 'pointer', fontFamily: t.fontSans,
                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
              }}>
                More <ChevronDown size={11} style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>

              {moreOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 220,
                  background: t.popover, color: t.popoverFg, border: `1px solid ${t.border}`,
                  borderRadius: t.radiusLg, padding: 6, boxShadow: t.shadowLg, zIndex: 300,
                }}>
                  {moreItems.map(item => (
                    <button key={item.id} onClick={() => { nav(item.path); setMoreOpen(false) }} style={{
                      width: '100%', padding: '10px 12px', borderRadius: t.radius, border: 'none',
                      background: 'transparent', color: t.popoverFg, fontSize: 13, fontWeight: 400,
                      cursor: 'pointer', fontFamily: t.fontSans, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    }}
                      onMouseOver={e => e.currentTarget.style.background = t.accent}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <item.Icon size={14} />{item.label}
                    </button>
                  ))}
                  <div style={{ height: 1, background: t.border, margin: '6px 4px' }} />
                  <button onClick={() => { nav('/settings'); setMoreOpen(false) }} style={{
                    width: '100%', padding: '10px 12px', borderRadius: t.radius, border: 'none',
                    background: 'transparent', color: t.popoverFg, fontSize: 13, fontWeight: 400,
                    cursor: 'pointer', fontFamily: t.fontSans, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  }}
                    onMouseOver={e => e.currentTarget.style.background = t.accent}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  ><SettingsIcon size={14} />Settings</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Avatar + mobile menu trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            className="mobile-menu-trigger"
            onClick={() => setMobileMenuOpen(true)}
            style={{
              display: 'none', background: 'none', border: 'none', cursor: 'pointer',
              color: t.fg, padding: 6, borderRadius: t.radius,
            }}
          ><Menu size={20} /></button>

          <div ref={avatarRef} style={{ position: 'relative' }}>
            <button onClick={() => setAvatarOpen(!avatarOpen)} style={{
              width: 36, height: 36, borderRadius: 999, border: `1px solid ${t.border}`,
              background: profile.avatar_url ? 'transparent' : t.accent,
              color: t.accentFg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, fontFamily: t.fontSans, overflow: 'hidden', padding: 0,
            }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                (profile.display_name || user?.email || 'U').charAt(0).toUpperCase()
              )}
            </button>
            {avatarOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 200,
                background: t.popover, color: t.popoverFg, border: `1px solid ${t.border}`,
                borderRadius: t.radiusLg, padding: 6, boxShadow: t.shadowLg, zIndex: 300,
              }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.border}`, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: t.fg }}>{profile.display_name || 'User'}</div>
                  <div style={{ fontSize: 11, color: t.mutedFg, marginTop: 2 }}>{user?.email}</div>
                </div>
                <button onClick={() => { nav('/settings'); setAvatarOpen(false) }} style={dropdownItemStyle}>
                  <SettingsIcon size={14} />Settings
                </button>
                <button onClick={() => signOut()} style={dropdownItemStyle}>
                  <LogOut size={14} />Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ─── Main outlet ─── */}
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', position: 'relative', background: t.bg }}>
        <Outlet context={{
          kikoMessages, setKikoMessages, kikoConvId, setKikoConvId,
          kikoNavigate, kikoResetKey, openPalette: () => setPaletteOpen(true)
        }} />
      </main>

      {/* ─── KikoFloat — every page except home ─── */}
      {!isHome && (
        <KikoFloat
          user={user}
          messages={kikoMessages}
          setMessages={setKikoMessages}
          convId={kikoConvId}
          setConvId={setKikoConvId}
          onNavigate={kikoNavigate}
        />
      )}

      <KikoToast />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* ─── Mobile menu overlay ─── */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: t.bg, zIndex: 400,
          display: 'flex', flexDirection: 'column', padding: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: t.fg, letterSpacing: '0.12em' }}>VAN HAWKE</span>
            <button onClick={() => setMobileMenuOpen(false)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: t.fg, padding: 6,
            }}><X size={20} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ALL_NAV.map(item => (
              <button key={item.id} onClick={() => { nav(item.path); setMobileMenuOpen(false) }} style={{
                padding: '14px 16px', borderRadius: t.radius, border: 'none',
                background: 'transparent', color: t.fg, fontSize: 15, fontWeight: 400,
                cursor: 'pointer', fontFamily: t.fontSans, display: 'flex', alignItems: 'center',
                gap: 12, textAlign: 'left',
              }}>
                <item.Icon size={18} />{item.label}
              </button>
            ))}
            <div style={{ height: 1, background: t.border, margin: '8px 4px' }} />
            <button onClick={() => { nav('/settings'); setMobileMenuOpen(false) }} style={{
              padding: '14px 16px', borderRadius: t.radius, border: 'none',
              background: 'transparent', color: t.fg, fontSize: 15, fontWeight: 400,
              cursor: 'pointer', fontFamily: t.fontSans, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            }}><SettingsIcon size={18} />Settings</button>
          </div>
        </div>
      )}
    </div>
  )
}

const dropdownItemStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 6, border: 'none',
  background: 'transparent', color: 'inherit', fontSize: 13, fontWeight: 400,
  cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center',
  gap: 10, textAlign: 'left',
}
