import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import { Settings, LogOut, Search, ChevronDown, BarChart3, Newspaper, Grid3X3, FileText } from 'lucide-react'
import KikoFloat from '../kiko/KikoFloat'
import KikoSymbol from '../kiko/KikoSymbol'
import CommandPalette from './CommandPalette'

const TABS = [
  { label: 'Home', path: '/' },
  { label: 'Pipeline', path: '/pipeline' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Contacts', path: '/contacts' },
]

const PAGE_LABELS = {
  '/pipeline': 'Pipeline', '/calendar': 'Calendar', '/contacts': 'Contacts',
  '/partnership-matrix': 'Partnership Matrix', '/email': 'Outreach Intelligence',
  '/news': 'News Signals', '/documents': 'Knowledge Library',
  '/organisations': 'Organisations', '/tasks': 'Tasks',
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

  const kikoNavigate = useCallback((page) => nav(page === 'home' ? '/' : `/${page}`), [nav])

  const initials = profile.first_name
    ? (profile.first_name[0] + (profile.last_name?.[0] || '')).toUpperCase()
    : (user?.email?.[0] || 'U').toUpperCase()

  const pageLabel = PAGE_LABELS[loc.pathname]
  const isTabActive = (path) => path === '/' ? isHome : loc.pathname === path

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Top bar */}
      <header style={{
        height: 56, minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', borderBottom: '0.5px solid rgba(0,0,0,0.04)', background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', flexShrink: 0, position: 'relative', zIndex: 250,
      }}>
        {/* Left: Logo only */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
          {/* Kiko logo */}
          <button onClick={() => { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1); nav('/') }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '0 12px 0 0' }}>
            {customLogo ? (
              <img src={customLogo} alt="Logo" style={{ height: 28, borderRadius: 7, maxWidth: 120, objectFit: 'contain' }} />
            ) : (
              <>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <KikoSymbol size={14} color="#fff" />
                </div>
                <span style={{ fontSize: 15, fontWeight: 500, color: '#1A1A1A', fontFamily: 'var(--font)', letterSpacing: '-0.01em' }}>Kiko</span>
              </>
            )}
          </button>

          {/* Breadcrumb — show on non-tab pages */}
          {!isHome && pageLabel && !TABS.find(t => t.path === loc.pathname) && (
            <>
              <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.08)', margin: '0 12px' }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>{pageLabel}</span>
            </>
          )}
        </div>

        {/* Center: Pill tab group — absolutely centered to prevent shift */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.04)', borderRadius: 12, padding: 3 }}>
            {TABS.map(tab => {
              const active = isTabActive(tab.path)
              return (
                <button key={tab.path} onClick={() => {
                  if (tab.path === '/') { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1) }
                  nav(tab.path)
                }} style={{
                  padding: '7px 16px', borderRadius: 12, border: 'none',
                  background: active ? 'rgba(0,0,0,0.85)' : 'transparent',
                  color: active ? '#fff' : 'rgba(0,0,0,0.45)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
                  transition: 'all 0.15s',
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                }}>{tab.label}</button>
              )
            })}
            {/* More tab with dropdown */}
            <div ref={moreRef} style={{ position: 'relative' }}>
              <button onClick={() => setMoreOpen(!moreOpen)} style={{
                padding: '7px 14px', borderRadius: 12, border: 'none',
                background: moreOpen ? 'rgba(0,0,0,0.06)' : 'transparent',
                color: 'rgba(0,0,0,0.45)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
                display: 'flex', alignItems: 'center', gap: 3, transition: 'all 0.15s',
              }}>
                More <ChevronDown size={11} style={{ transition: 'transform 0.2s', transform: moreOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {moreOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  width: 200, background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '4px', zIndex: 300, animation: 'fadeIn 0.12s ease-out',
                }}>
                  {[
                    { label: 'Outreach Intelligence', path: '/email', Icon: BarChart3 },
                    { label: 'News Signals', path: '/news', Icon: Newspaper },
                    { label: 'Matrix', path: '/partnership-matrix', Icon: Grid3X3 },
                    { label: 'Documents', path: '/documents', Icon: FileText },
                  ].map(item => (
                    <button key={item.label} onClick={() => { nav(item.path); setMoreOpen(false) }} style={{
                      width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none',
                      background: loc.pathname === item.path ? 'rgba(0,0,0,0.04)' : 'transparent',
                      color: loc.pathname === item.path ? '#1A1A1A' : '#6B6B6B', textAlign: 'left',
                      fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)',
                      display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
                    }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                      onMouseOut={e => e.currentTarget.style.background = loc.pathname === item.path ? 'rgba(0,0,0,0.04)' : 'transparent'}
                    ><item.Icon size={14} />{item.label}</button>
                  ))}
                  <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '4px 8px' }} />
                  <button onClick={() => { nav('/settings'); setMoreOpen(false) }} style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none',
                    background: 'transparent', color: '#6B6B6B', textAlign: 'left',
                    fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)',
                    display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
                  }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: 'rgba(34,197,94,0.06)', border: '0.5px solid rgba(34,197,94,0.12)', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(34,197,94,0.7)', animation: 'kikoBreathe 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(34,197,94,0.8)', fontFamily: 'var(--font)' }}>{voiceStatus}</span>
            </div>
          )}
          {/* Command palette trigger */}
          <button onClick={() => setPaletteOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 11px', borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.5)',
            cursor: 'pointer', fontFamily: 'var(--font)',
            color: 'rgba(0,0,0,0.35)', fontSize: 12, transition: 'all 0.15s',
          }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.background = 'rgba(0,0,0,0.05)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)'; e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }}
          >
            <Search size={13} />
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.6 }}>&#8984;K</span>
          </button>

          {/* User avatar dropdown */}
          <div ref={avatarRef} style={{ position: 'relative' }}>
            <button onClick={() => setAvatarOpen(!avatarOpen)} style={{
              width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: profile.profile_photo_url ? 'transparent' : '#1A1A1A',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, overflow: 'hidden',
            }}>
              {profile.profile_photo_url ? (
                <img src={profile.profile_photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', fontFamily: 'var(--font)' }}>{initials}</span>
              )}
            </button>
            {avatarOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                width: 200, background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04)',
                padding: '6px', zIndex: 400, animation: 'fadeIn 0.15s ease-out',
              }}>
                <div style={{ padding: '8px 12px 10px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', fontFamily: 'var(--font)' }}>
                    {profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user?.email?.split('@')[0] || 'User'}
                  </div>
                  <div style={{ fontSize: 11, color: '#ABABAB', fontFamily: 'var(--font)', marginTop: 2 }}>{user?.email}</div>
                </div>
                <button onClick={() => { nav('/settings'); setAvatarOpen(false) }} style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none',
                  background: 'transparent', color: '#6B6B6B', textAlign: 'left',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
                }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                ><Settings size={14} /> Settings</button>
                <button onClick={() => { signOut(); setAvatarOpen(false) }} style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none',
                  background: 'transparent', color: '#FF3B30', textAlign: 'left',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
                }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,59,48,0.04)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                ><LogOut size={14} /> Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
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

      {/* Command palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
