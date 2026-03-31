import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import T from '@/lib/theme'
import { Settings, LogOut, Search, ChevronDown, BarChart3, Grid3X3, Building2, Home, GitBranch, Calendar, Users, MoreHorizontal, Send, Target } from 'lucide-react'
import KikoFloat from '../kiko/KikoFloat'
import KikoToast from '../kiko/KikoToast'
import KikoSymbol from '../kiko/KikoSymbol'
import CommandPalette from './CommandPalette'
import AuroraCanvas from '../AuroraCanvas'

// All navigable pages
const ALL_NAV = [
  { id: 'home', label: 'Home', path: '/', Icon: Home },
  { id: 'pipeline', label: 'Pipeline', path: '/pipeline', Icon: GitBranch },
  { id: 'calendar', label: 'Race Calendar', path: '/calendar', Icon: Calendar },
  { id: 'contacts', label: 'Contacts', path: '/contacts', Icon: Users },
  { id: 'organisations', label: 'Organisations', path: '/organisations', Icon: Building2 },
  { id: 'command-centre', label: 'Command Centre', path: '/command-centre', Icon: Target },
  { id: 'partnership-matrix', label: 'Partnership Matrix', path: '/partnership-matrix', Icon: Grid3X3 },
  { id: 'lemlist', label: 'Lemlist', path: '/lemlist', Icon: Send },
]
const VALID_NAV_IDS = new Set(ALL_NAV.map(n => n.id))
const DEFAULT_TOP_IDS = ['home', 'pipeline', 'partnership-matrix', 'email']

function getTopNavIds() {
  try {
    const s = localStorage.getItem('kiko_top_nav')
    if (s) {
      const parsed = JSON.parse(s)
      // Remove stale items that no longer exist in nav
      const cleaned = parsed.filter(id => VALID_NAV_IDS.has(id))
      if (cleaned.length !== parsed.length) {
        localStorage.setItem('kiko_top_nav', JSON.stringify(cleaned.length > 0 ? cleaned : DEFAULT_TOP_IDS))
        return cleaned.length > 0 ? cleaned : DEFAULT_TOP_IDS
      }
      return parsed
    }
  } catch {}
  return DEFAULT_TOP_IDS
}

const PAGE_LABELS = {
  '/pipeline': 'Pipeline', '/calendar': 'Race Calendar', '/contacts': 'Contacts',
  '/partnership-matrix': 'Partnership Matrix', '/email': 'Command Centre',
  '/organisations': 'Organisations', '/lemlist': 'Lemlist',
  '/settings': 'Settings', '/dashboard': 'Dashboard',
}

export default function Layout({ user }) {
  const loc = useLocation()
  const nav = useNavigate()
  const isHome = loc.pathname === '/' || loc.pathname === '/home'

  const [profile, setProfile] = useState({})
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('Listening')
  const [topNavIds, setTopNavIds] = useState(getTopNavIds)
  
  // Listen for Settings nav changes
  useEffect(() => {
    const handler = () => setTopNavIds(getTopNavIds())
    const moreHandler = () => { try { const s = localStorage.getItem('kiko_more_order'); setMoreOrder(s ? JSON.parse(s) : null) } catch {} }
    window.addEventListener('kiko_top_nav_updated', handler)
    window.addEventListener('kiko_more_order_updated', moreHandler)
    return () => { window.removeEventListener('kiko_top_nav_updated', handler); window.removeEventListener('kiko_more_order_updated', moreHandler) }
  }, [])

  const TABS = topNavIds.map(id => ALL_NAV.find(n => n.id === id)).filter(Boolean)
  // More items respect custom order from Settings
  const moreItemsRaw = ALL_NAV.filter(n => !topNavIds.includes(n.id))
  const [moreOrder, setMoreOrder] = useState(() => { try { const s = localStorage.getItem('kiko_more_order'); return s ? JSON.parse(s) : null } catch { return null } })
  const MORE_ITEMS = moreOrder
    ? [...moreItemsRaw].sort((a, b) => { const ai = moreOrder.indexOf(a.id); const bi = moreOrder.indexOf(b.id); return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) })
    : moreItemsRaw
  const moreRef = useRef(null)
  const [customLogo, setCustomLogo] = useState(() => { try { return localStorage.getItem('custom_logo_url') } catch { return null } })
  const avatarRef = useRef(null)

  // Listen for custom logo changes
  useEffect(() => {
    const handler = () => { try { setCustomLogo(localStorage.getItem('custom_logo_url')) } catch {} }
    window.addEventListener('kiko_logo_updated', handler)
    return () => window.removeEventListener('kiko_logo_updated', handler)
  }, [])

  // Listen for voice state changes from KikoChat
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false)
  useEffect(() => {
    const handler = (e) => {
      setVoiceActive(e.detail?.active || false)
      const d = e.detail || {}
      setVoiceStatus(d.speaking ? 'Kiko is speaking' : d.thinking ? 'Thinking...' : d.status === 'connecting' ? 'Connecting...' : 'Listening')
    }
    window.addEventListener('kiko_voice_state', handler)
    return () => window.removeEventListener('kiko_voice_state', handler)
  }, [])

  // Listen for chat history panel open/close
  useEffect(() => {
    const handler = (e) => setChatHistoryOpen(e.detail?.open || false)
    window.addEventListener('kiko_history_state', handler)
    return () => window.removeEventListener('kiko_history_state', handler)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const load = () => {
      supabase.from('user_settings').select('first_name, last_name, display_name, profile_photo_url')
        .eq('user_id', user.id).single()
        .then(({ data }) => { if (data) setProfile(data) })
    }
    load()
    window.addEventListener('kiko_profile_updated', load)
    return () => window.removeEventListener('kiko_profile_updated', load)
  }, [user?.id])

  // Close avatar dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false)
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Kiko conversation state
  const [kikoMessages, setKikoMessages] = useState([])
  const [kikoConvId, setKikoConvId] = useState(null)
  const [kikoResetKey, setKikoResetKey] = useState(0)
  const [voiceFullscreen, setVoiceFullscreen] = useState(false)

  // Listen for voice fullscreen toggle from KikoChat
  useEffect(() => {
    const handler = (e) => setVoiceFullscreen(e.detail?.active || false)
    window.addEventListener('kiko_voice_fullscreen', handler)
    return () => window.removeEventListener('kiko_voice_fullscreen', handler)
  }, [])

  const kikoNavigate = useCallback((page) => nav(page === 'home' ? '/' : `/${page}`), [nav])

  const initials = profile.first_name
    ? (profile.first_name[0] + (profile.last_name?.[0] || '')).toUpperCase()
    : (user?.email?.[0] || 'U').toUpperCase()

  const pageLabel = PAGE_LABELS[loc.pathname]
  const isTabActive = (path) => path === '/' ? isHome : loc.pathname === path

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: T.bg }}>
      {/* Aurora gradient orbs */}
      <AuroraCanvas extraOrb={loc.pathname === '/pipeline' ? 'amber' : null} />

      {/* Top bar — frosted glass */}
      <header style={{
        height: 56, minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', borderBottom: 'none',
        background: 'transparent',
        flexShrink: 0, position: 'relative', zIndex: 250,
        transition: 'all 0.6s cubic-bezier(0.4,0,0,1)',
        opacity: voiceFullscreen ? 0 : 1,
        transform: voiceFullscreen ? 'translateY(-56px)' : 'translateY(0)',
        marginBottom: voiceFullscreen ? -56 : 0,
        pointerEvents: voiceFullscreen ? 'none' : 'auto',
      }}>
        {/* Left: Brand logo — plain text, not a pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
          <button onClick={() => { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1); nav('/') }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {customLogo ? (
              <img src={customLogo} alt="Logo" style={{ height: 36, borderRadius: 8, maxWidth: 160, objectFit: 'contain' }} />
            ) : (
              <>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.55)', fontFamily: T.font, letterSpacing: '0.12em' }}>VAN HAWKE<sup style={{ fontSize: 8, verticalAlign: 'super', opacity: 0.5 }}>™</sup></span>
              </>
            )}
          </button>
        </div>

        {/* Center: Pill tab group — absolutely centered to prevent shift */}
        <div className="desktop-top-nav" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 3, background: T.glass, backdropFilter: T.glassBlur, WebkitBackdropFilter: T.glassBlur, borderRadius: 50, padding: 4, border: `1.5px solid ${T.glassBorder}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.2)' }}>
            {TABS.map(tab => {
              const active = isTabActive(tab.path)
              return (
                <button key={tab.path} onClick={() => {
                  if (tab.path === '/') { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1) }
                  nav(tab.path)
                }} style={{
                  padding: '7px 22px', borderRadius: 50, border: 'none',
                  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                  fontSize: 13, fontWeight: active ? 400 : 300, cursor: 'pointer', fontFamily: T.font,
                  boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.2)' : 'none',
                  transition: 'all 0.2s',
                }}
                  onMouseOver={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}}
                  onMouseOut={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'transparent' }}}
                >{tab.label}</button>
              )
            })}
            {/* More tab with dropdown */}
            <div ref={moreRef} style={{ position: 'relative' }}>
              <button onClick={() => setMoreOpen(!moreOpen)} style={{
                padding: '7px 22px', borderRadius: 50, border: 'none',
                background: moreOpen ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: moreOpen ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: 300, cursor: 'pointer', fontFamily: T.font,
                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s',
              }}
                onMouseOver={e => { if (!moreOpen) { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}}
                onMouseOut={e => { if (!moreOpen) { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'transparent' }}}
              >
                More <ChevronDown size={11} style={{ transition: 'transform 0.2s', transform: moreOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {moreOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  width: 240, background: 'rgba(14,14,20,0.85)', backdropFilter: T.glassBlur, WebkitBackdropFilter: T.glassBlur,
                  borderRadius: 18, border: `1.5px solid ${T.glassBorder}`,
                  boxShadow: T.glassShadow, padding: '6px', zIndex: 300, animation: 'fadeIn 0.12s ease-out',
                }}>
                  {MORE_ITEMS.map(item => {
                    const Icon = item.Icon || Building2
                    return (
                    <button key={item.label} onClick={() => { nav(item.path); setMoreOpen(false) }} style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none',
                      background: loc.pathname === item.path ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: loc.pathname === item.path ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)', textAlign: 'left',
                      fontSize: 13, fontWeight: 300, cursor: 'pointer', fontFamily: T.font,
                      display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                    }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
                      onMouseOut={e => { e.currentTarget.style.background = loc.pathname === item.path ? 'rgba(255,255,255,0.08)' : 'transparent'; e.currentTarget.style.color = loc.pathname === item.path ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}
                    ><Icon size={14} />{item.label}</button>
                  )})}
                  {MORE_ITEMS.length > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 8px' }} />}
                  <button onClick={() => { nav('/settings'); setMoreOpen(false) }} style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none',
                    background: 'transparent', color: 'rgba(255,255,255,0.4)', textAlign: 'left',
                    fontSize: 13, fontWeight: 300, cursor: 'pointer', fontFamily: T.font,
                    display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                  }}
                    onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
                  ><Settings size={14} />Settings</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Voice status + ⌘K pill + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Listening pill — only when voice is active */}
          {voiceActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 50, background: 'rgba(6,214,160,0.04)', border: '1.5px solid rgba(6,214,160,0.1)', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(6,214,160,0.7)', animation: 'kikoBreathe 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(6,214,160,0.6)', fontFamily: 'var(--font)' }}>{voiceStatus}</span>
            </div>
          )}
          {/* Command palette trigger */}
          <button onClick={() => setPaletteOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 50, border: '1.5px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            cursor: 'pointer', fontFamily: 'var(--font)',
            color: 'rgba(255,255,255,0.25)', fontSize: 13, transition: 'all 0.15s',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          >
            <Search size={14} />
            <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.6 }}>&#8984;K</span>
          </button>

          {/* User avatar dropdown */}
          <div ref={avatarRef} style={{ position: 'relative' }}>
            <button onClick={() => setAvatarOpen(!avatarOpen)} style={{
              width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
              background: profile.profile_photo_url ? 'transparent' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, overflow: 'hidden',
            }}>
              {profile.profile_photo_url ? (
                <img src={profile.profile_photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--font)' }}>{initials}</span>
              )}
            </button>
            {avatarOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                width: 200, background: 'rgba(14,14,20,0.9)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
                borderRadius: 18, border: '1.5px solid rgba(255,255,255,0.1)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 40px rgba(0,0,0,0.5)',
                padding: '6px', zIndex: 400, animation: 'fadeIn 0.15s ease-out',
              }}>
                <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--font)' }}>
                    {profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user?.email?.split('@')[0] || 'User'}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font)', marginTop: 2 }}>{user?.email}</div>
                </div>
                <button onClick={() => { nav('/settings'); setAvatarOpen(false) }} style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10, border: 'none',
                  background: 'transparent', color: 'rgba(255,255,255,0.4)', textAlign: 'left',
                  fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
                }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
                ><Settings size={14} /> Settings</button>
                <button onClick={() => { signOut(); setAvatarOpen(false) }} style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10, border: 'none',
                  background: 'transparent', color: 'rgba(255,80,80,0.7)', textAlign: 'left',
                  fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
                }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,80,80,0.06)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                ><LogOut size={14} /> Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        <Outlet context={{ kikoMessages, setKikoMessages, kikoConvId, setKikoConvId, kikoNavigate, kikoResetKey, openPalette: () => setPaletteOpen(true) }} />
      </main>

      {/* Kiko floating — present on every page except home */}
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

      {/* Command palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Mobile bottom tab bar — visible only below 768px */}
      <nav className="mobile-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(7,7,11,0.92)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'none', // shown via CSS media query
        justifyContent: 'space-around', alignItems: 'center',
        padding: '6px 0 env(safe-area-inset-bottom, 8px)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
      }}>
        {TABS.slice(0, 4).map(tab => {
          const active = isTabActive(tab.path)
          const Icon = tab.Icon || Home
          return (
            <button key={tab.path} onClick={() => {
              if (tab.path === '/') { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1) }
              nav(tab.path)
            }} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px 16px',
              color: active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.32)',
              transition: 'color 0.15s', fontFamily: T.font,
            }}>
              <Icon size={20} strokeWidth={active ? 2 : 1.5} />
              <span style={{ fontSize: 10, fontWeight: active ? 500 : 300, letterSpacing: '0.01em' }}>{tab.label}</span>
            </button>
          )
        })}
        <button onClick={() => setMoreOpen(!moreOpen)} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 16px',
          color: 'rgba(255,255,255,0.32)', fontFamily: T.font,
        }}>
          <MoreHorizontal size={20} strokeWidth={1.5} />
          <span style={{ fontSize: 10, fontWeight: 300 }}>More</span>
        </button>
      </nav>

      {/* Mobile responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-bottom-nav { display: flex !important; }
          .desktop-top-nav { display: none !important; }
          main { padding-bottom: 72px !important; }
        }
      `}</style>
    </div>
  )
}
