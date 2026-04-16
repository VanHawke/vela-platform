// FUTURE: optional auto-logout after N minutes of inactivity.
// Configurable in Settings → Profile (default OFF).
// Implementation: useEffect with mousedown/keydown listeners + setTimeout that calls supabase.auth.signOut().
// Deferred until requested — Sunny flagged 11 April 2026.
import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
// applyFavicon is now handled by OrgContext — import removed
// Design tokens — hardcoded (matching Sequences.jsx)
const C = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#FFFFFF',
  border: 'rgba(0,0,0,0.06)',
  borderHover: 'rgba(0,0,0,0.10)',
  text: '#0A0A0A',
  textSec: '#6B6B6B',
  textTer: '#A0A0A0',
  textMut: '#A0A0A0',
  purple: '#0A0A0A',
  teal: '#0A0A0A',
  green: '#34D399',
  red: '#F87171',
  amber: '#FBBF24',
  blue: '#60A5FA',
  linkedin: '#0077B5',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  r: 8,
}
import { Settings, LogOut, Search, ChevronDown, BarChart3, Grid3X3, Building2, Home, GitBranch, Calendar, Users, MoreHorizontal, Send, Target, Menu, X, Zap, Mail, Filter, Layers, Database, Compass, Linkedin, Activity } from 'lucide-react'
import KikoFloat from '../kiko/KikoFloat'
import ThreadIndicator from '../kiko/ThreadIndicator'
import NotificationToast from '../kiko/NotificationToast'
import BackgroundTasksPanel from '../kiko/BackgroundTasksPanel'
import OnboardingModal from '../onboarding/OnboardingModal'
import { usePagePermissions } from '@/lib/usePagePermissions'
import { useUserSettings } from '@/lib/useUserSettings'
import { useOrg } from '@/contexts/OrgContext'
import KikoVoice from '../kiko/KikoVoice'
import KikoToast from '../kiko/KikoToast'
import KikoSymbol from '../kiko/KikoSymbol'
import CommandPalette from './CommandPalette'
import LegoraTopNav from './LegoraTopNav'
import AuroraCanvas from '../AuroraCanvas'
import { useKikoPolish } from '@/lib/useKikoPolish'

// All navigable pages
const ALL_NAV = [
  { id: 'home', label: 'Home', path: '/', Icon: Home },
  { id: 'pipeline', label: 'Pipeline', path: '/pipeline', Icon: GitBranch },
  { id: 'calendar', label: 'Calendar', path: '/calendar', Icon: Calendar },
  { id: 'contacts', label: 'Contacts', path: '/contacts', Icon: Users },
  { id: 'organisations', label: 'Organisations', path: '/organisations', Icon: Building2 },
  { id: 'command-centre', label: 'Command Centre', path: '/command-centre', Icon: Target },
  { id: 'partnership-matrix', label: 'Partnership Matrix', path: '/partnership-matrix', Icon: Grid3X3 },
  { id: 'sequences', label: 'Campaigns', path: '/campaigns', Icon: Zap },
  { id: 'linkedin', label: 'LinkedIn Queue', path: '/linkedin', Icon: Linkedin },
]
// Super-admin-only nav items appended to ALL_NAV at runtime if user role is super_admin.
// Health Center surfaces system_health alerts (replaces the old health-warning emails).
const ADMIN_NAV = [
  { id: 'health', label: 'Health Center', path: '/admin/system', Icon: Activity },
]
const VALID_NAV_IDS = new Set(ALL_NAV.map(n => n.id))
// Default = ALL valid tabs so reorder toggles show the full list on first load
const DEFAULT_TOP_IDS = ALL_NAV.map(n => n.id)
const TOP_NAV_STORAGE_KEY = 'kiko_top_nav_v2'

function getTopNavIds() {
  try {
    const s = localStorage.getItem(TOP_NAV_STORAGE_KEY)
    if (s) {
      const parsed = JSON.parse(s)
      if (!Array.isArray(parsed)) return DEFAULT_TOP_IDS
      // Remove stale items that no longer exist in nav
      const cleaned = parsed.filter(id => VALID_NAV_IDS.has(id))
      // If user legitimately cleared down to even 1 item, respect it (was previously <4 treated as corrupt).
      // Only fall back to defaults if the list is genuinely empty.
      if (cleaned.length === 0) return DEFAULT_TOP_IDS
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(TOP_NAV_STORAGE_KEY, JSON.stringify(cleaned))
      }
      return cleaned
    }
  } catch {}
  return DEFAULT_TOP_IDS
}

const PAGE_LABELS = {
  '/pipeline': 'Pipeline', '/calendar': 'Calendar', '/contacts': 'Contacts',
  '/partnership-matrix': 'Partnership Matrix', '/email': 'Command Centre',
  '/organisations': 'Organisations', '/campaigns': 'Campaigns', '/sequences': 'Campaigns', '/inbox': 'Inbox', '/segments': 'Segments', '/packs': 'Vertical Pack', '/targets': 'Targets',
  '/settings': 'Settings', '/dashboard': 'Dashboard',
}

export default function Layout({ user }) {
  // Activate Legora polish layer (spotlight, sparkle, magnetic, count-up auto-bind)
  useKikoPolish()
  const loc = useLocation()
  const nav = useNavigate()
  const isHome = loc.pathname === '/' || loc.pathname === '/home'

  const [profile, setProfile] = useState({})
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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

  // Shared user_settings fetch — dedups across Layout + NotificationToast + OnboardingModal
  // MUST be declared before any useEffect that references userSettings (TDZ)
  const { row: userSettings } = useUserSettings(user)

  // Onboarding check — show modal for users who haven't completed onboarding
  useEffect(() => {
    if (!userSettings) return
    if (userSettings.onboarded === false) setShowOnboarding(true)
  }, [userSettings?.onboarded])

  // Page permissions — filter nav items based on user's role + per-user overrides
  const userOrgIdNew = '2c6b30da-2d1a-45e5-bbeb-dee1671deba3' // TODO: resolve dynamically when multi-org
  const { canSee: canSeePage } = usePagePermissions(user, userOrgIdNew)
  const NAV_ID_TO_PAGE_KEY = { 'home': 'home', 'pipeline': 'pipeline', 'calendar': 'race_calendar', 'contacts': 'contacts', 'organisations': 'organisations', 'command-centre': 'command_centre', 'partnership-matrix': 'partnership_matrix', 'sequences': 'campaigns', 'linkedin': 'campaigns' }

  const isSuperAdmin = user?.app_metadata?.role === 'super_admin'
  // Effective nav = base nav + admin nav (only if super_admin)
  const EFFECTIVE_NAV = isSuperAdmin ? [...ALL_NAV, ...ADMIN_NAV] : ALL_NAV

  const TABS = topNavIds.map(id => EFFECTIVE_NAV.find(n => n.id === id)).filter(Boolean).filter(t => canSeePage(NAV_ID_TO_PAGE_KEY[t.id] || t.id))
  // More items respect custom order from Settings
  const moreItemsRaw = EFFECTIVE_NAV.filter(n => !topNavIds.includes(n.id)).filter(t => canSeePage(NAV_ID_TO_PAGE_KEY[t.id] || t.id))
  const [moreOrder, setMoreOrder] = useState(() => { try { const s = localStorage.getItem('kiko_more_order'); return s ? JSON.parse(s) : null } catch { return null } })
  const MORE_ITEMS = moreOrder
    ? [...moreItemsRaw].sort((a, b) => { const ai = moreOrder.indexOf(a.id); const bi = moreOrder.indexOf(b.id); return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) })
    : moreItemsRaw
  const moreRef = useRef(null)
  const { logoUrl: customLogo } = useOrg() || {}
  const avatarRef = useRef(null)

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
    // Pull profile fields from the shared user_settings row (already deduped by useUserSettings)
    if (userSettings && userSettings.user_id) {
      setProfile({
        first_name: userSettings.first_name,
        last_name: userSettings.last_name,
        display_name: userSettings.display_name,
        profile_photo_url: userSettings.profile_photo_url,
      })
    }
    // Re-fetch on explicit profile-updated event (e.g. after uploading new photo)
    const load = () => {
      supabase.from('user_settings').select('first_name, last_name, display_name, profile_photo_url')
        .eq('user_id', user.id).single()
        .then(({ data }) => { if (data) setProfile(data) })
    }
    window.addEventListener('kiko_profile_updated', load)
    return () => window.removeEventListener('kiko_profile_updated', load)
  }, [user?.id, userSettings])

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
  const [globalVoiceMode, setGlobalVoiceMode] = useState(false)
  const [floatVoiceRequested, setFloatVoiceRequested] = useState(false)

  // Voice transcript accumulator + autosave to conversations table.
  // Builds up a messages[] from KikoVoice's onMessage callbacks, debounces
  // saves to Supabase every ~1.5s. The result: voice conversations show
  // up in chat history, can be reopened, and Kiko remembers them next session
  // because they live in the same conversations table that KikoChat reads from.
  const voiceMsgsRef = useRef([])
  const voiceConvIdRef = useRef(null)
  const voiceSaveTimerRef = useRef(null)
  const handleVoiceMessage = useCallback(async (msg) => {
    if (!msg?.content || !user?.id) return
    // Push into the running buffer (mapped to schema {role, content})
    const role = msg.role === 'kiko' ? 'assistant' : 'user'
    voiceMsgsRef.current = [...voiceMsgsRef.current, { role, content: msg.content, timestamp: msg.at || Date.now() }]
    // Debounce save — clear pending, save 1.5s after the last message
    if (voiceSaveTimerRef.current) clearTimeout(voiceSaveTimerRef.current)
    voiceSaveTimerRef.current = setTimeout(async () => {
      try {
        const allMsgs = voiceMsgsRef.current
        if (allMsgs.length === 0) return
        if (voiceConvIdRef.current) {
          await supabase.from('conversations').update({ messages: allMsgs, updated_at: new Date().toISOString() }).eq('id', voiceConvIdRef.current)
        } else {
          // Create new conversation row. Title from first user message + 🎙 prefix
          // so it's visually distinguishable in chat history.
          const firstUserMsg = allMsgs.find(m => m.role === 'user')?.content || 'Voice conversation'
          const title = '🎙 ' + firstUserMsg.slice(0, 58)
          const { data } = await supabase.from('conversations').insert({
            user_id: user.id,
            org_id: user.app_metadata?.org_id,
            title,
            messages: allMsgs,
            metadata: { source: 'voice', started_at: new Date().toISOString() }
          }).select('id').single()
          if (data?.id) {
            voiceConvIdRef.current = data.id
            setKikoConvId(data.id)  // surface to outlet so reopening from chat history works
          }
        }
      } catch (e) {
        console.error('[Layout] Voice conversation save failed:', e)
      }
    }, 1500)
  }, [user])

  // Reset voice buffer when voice mode closes — next voice session starts a new conversation
  const handoffPendingRef = useRef(false)
  useEffect(() => {
    const handler = () => { handoffPendingRef.current = true }
    window.addEventListener('kiko_voice_handoff', handler)
    return () => window.removeEventListener('kiko_voice_handoff', handler)
  }, [])

  useEffect(() => {
    if (!globalVoiceMode && !voiceFullscreen) {
      // Flush any pending save immediately, then reset
      if (voiceSaveTimerRef.current) {
        clearTimeout(voiceSaveTimerRef.current)
        voiceSaveTimerRef.current = null
      }
      // CRITICAL FIX 2026-04-12: handle BOTH cases on close —
      // (a) UPDATE existing conv if id exists
      // (b) INSERT fresh conv if no id (debounced save never fired before close,
      //     which happens on instant goodbye-triggered closes)
      // Without (b), every short voice session lost its transcript.
      if (voiceMsgsRef.current.length > 0 && user?.id) {
        const finalMsgs = voiceMsgsRef.current
        const wasHandoff = handoffPendingRef.current
        handoffPendingRef.current = false
        if (voiceConvIdRef.current) {
          const finalConvId = voiceConvIdRef.current
          supabase.from('conversations').update({
            messages: finalMsgs,
            updated_at: new Date().toISOString()
          }).eq('id', finalConvId).then(() => {
            console.log('[Layout] Voice conv UPDATED on close:', finalConvId, finalMsgs.length, 'msgs')
            // If user clicked Continue in chat, navigate to / and load this conv
            if (wasHandoff) {
              nav('/')
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('kiko_load_conversation', {
                  detail: { id: finalConvId, messages: finalMsgs, title: '🎙 Voice handoff', type: 'voice' }
                }))
              }, 200)
            }
          })
        } else {
          // First save never fired — INSERT fresh row now
          const firstUserMsg = finalMsgs.find(m => m.role === 'user')?.content || 'Voice conversation'
          const title = '🎙 ' + firstUserMsg.slice(0, 58)
          supabase.from('conversations').insert({
            user_id: user.id,
            org_id: user.app_metadata?.org_id,
            title,
            messages: finalMsgs,
            metadata: { source: 'voice', started_at: new Date().toISOString() }
          }).select('id').single().then(({ data }) => {
            console.log('[Layout] Voice conv INSERTED on close:', finalMsgs.length, 'msgs')
            if (wasHandoff && data?.id) {
              nav('/')
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('kiko_load_conversation', {
                  detail: { id: data.id, messages: finalMsgs, title, type: 'voice' }
                }))
              }, 200)
            }
          })
        }
      }
      // Reset for next session
      voiceMsgsRef.current = []
      voiceConvIdRef.current = null
    }
  }, [globalVoiceMode, voiceFullscreen, user])

  // Listen for voice messages dispatched from KikoFloat's useRealtimeVoice
  // (the home-page voice path goes through the hook, not the component, so it
  // needs an event-bus bridge to reach Layout's handleVoiceMessage)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) handleVoiceMessage(e.detail)
    }
    window.addEventListener('kiko_voice_message', handler)
    return () => window.removeEventListener('kiko_voice_message', handler)
  }, [handleVoiceMessage])

  // Listen for voice fullscreen toggle from KikoChat
  useEffect(() => {
    const handler = (e) => setVoiceFullscreen(e.detail?.active || false)
    window.addEventListener('kiko_voice_fullscreen', handler)
    return () => window.removeEventListener('kiko_voice_fullscreen', handler)
  }, [])

  // Listen for global voice mode toggle (from KikoFloat EQ button on non-home pages)
  useEffect(() => {
    const handler = () => setGlobalVoiceMode(true)
    window.addEventListener('kiko_open_voice', handler)
    return () => window.removeEventListener('kiko_open_voice', handler)
  }, [])

  const kikoNavigate = useCallback((page) => nav(page === 'home' ? '/' : `/${page}`), [nav])

  // Listen for voice navigation (kiko_navigate event from voice tools)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.page) {
        // Reset fullscreen voice state — nav must be visible on destination page
        setVoiceFullscreen(false)
        // Request KikoFloat to activate inline voice on destination page (voice follows you)
        setFloatVoiceRequested(true)
        // Navigate via React Router
        kikoNavigate(e.detail.page)
      }
    }
    window.addEventListener('kiko_navigate', handler)
    return () => window.removeEventListener('kiko_navigate', handler)
  }, [kikoNavigate])

  const initials = profile.first_name
    ? (profile.first_name[0] + (profile.last_name?.[0] || '')).toUpperCase()
    : (user?.email?.[0] || 'U').toUpperCase()

  const pageLabel = PAGE_LABELS[loc.pathname]
  const isTabActive = (path) => path === '/' ? isHome : loc.pathname === path

  // Safety: reset voiceFullscreen when leaving home page
  useEffect(() => {
    if (!isHome && voiceFullscreen) setVoiceFullscreen(false)
  }, [isHome, voiceFullscreen])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: C.bg }}>
      {/* Aurora gradient orbs */}
      <AuroraCanvas extraOrb={loc.pathname === '/pipeline' ? 'amber' : null} />

      {/* Legora top nav */}
      <LegoraTopNav
        user={user}
        profile={profile}
        customLogo={customLogo}
        hasNotifications={true}
        isAdmin={isSuperAdmin}
        onSearchClick={() => setCommandPaletteOpen(true)}
      />


      {/* Mobile navigation menu overlay */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 48, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          zIndex: 240, animation: 'fadeIn 0.15s ease-out',
        }} onClick={() => setMobileMenuOpen(false)}>
          <div style={{
            background: 'rgba(0,0,0,0.03)', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
            padding: '8px 12px', maxHeight: '70vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            {ALL_NAV.map(item => {
              const Icon = item.Icon || Building2
              const active = isTabActive(item.path)
              return (
                <button key={item.id} onClick={() => {
                  if (item.path === '/') { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1) }
                  nav(item.path); setMobileMenuOpen(false)
                }} style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none',
                  background: active ? 'rgba(0,0,0,0.08)' : 'transparent',
                  color: active ? '#0A0A0A' : '#6B6B6B',
                  fontSize: 15, fontWeight: active ? 400 : 300, cursor: 'pointer', fontFamily: C.font,
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', transition: 'all 0.15s',
                }}>
                  <Icon size={16} />{item.label}
                </button>
              )
            })}
            <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '6px 8px' }} />
            <button onClick={() => { nav('/settings'); setMobileMenuOpen(false) }} style={{
              width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none',
              background: 'transparent', color: '#A0A0A0',
              fontSize: 15, fontWeight: 300, cursor: 'pointer', fontFamily: C.font,
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            }}><Settings size={16} />Settings</button>
          </div>
        </div>
      )}

      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        <Outlet context={{ kikoMessages, setKikoMessages, kikoConvId, setKikoConvId, kikoNavigate, kikoResetKey, openPalette: () => setPaletteOpen(true) }} />
      </main>

      {/* Realtime notifications toast (v0.0.39) */}
      <NotificationToast user={user} />
      <BackgroundTasksPanel user={user} />
      {showOnboarding && <OnboardingModal user={user} onDismiss={() => setShowOnboarding(false)} />}

      {/* Kiko floating — present on every page except home */}
      {!isHome && (
        <KikoFloat
          user={user}
          messages={kikoMessages}
          setMessages={setKikoMessages}
          convId={kikoConvId}
          setConvId={setKikoConvId}
          onNavigate={kikoNavigate}
          autoVoice={floatVoiceRequested}
          onAutoVoiceConsumed={() => setFloatVoiceRequested(false)}
        />
      )}

      {/* Global voice mode — triggered from KikoFloat EQ button on non-home pages */}
      {globalVoiceMode && (
        <KikoVoice
          onClose={() => setGlobalVoiceMode(false)}
          user={user}
          onMessage={handleVoiceMessage}
          onVoiceState={(state) => {
            setVoiceActive(state.speaking || state.thinking || state.status === 'Listening')
            setVoiceStatus(state.speaking ? 'Kiko is speaking' : state.thinking ? 'Thinking...' : 'Listening')
          }}
        />
      )}

      <KikoToast />

      {/* Command palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Mobile bottom tab bar — visible only below 768px */}
      <nav className="mobile-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.02)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
        borderTop: '0.5px solid rgba(0,0,0,0.08)',
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
              color: active ? '#0A0A0A' : '#A0A0A0',
              transition: 'color 0.15s', fontFamily: C.font,
            }}>
              <Icon size={20} strokeWidth={active ? 2 : 1.5} />
              <span style={{ fontSize: 10, fontWeight: active ? 500 : 300, letterSpacing: '0.01em' }}>{tab.label}</span>
            </button>
          )
        })}
        <button onClick={() => setMoreOpen(!moreOpen)} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 16px',
          color: '#A0A0A0', fontFamily: C.font,
        }}>
          <MoreHorizontal size={20} strokeWidth={1.5} />
          <span style={{ fontSize: 10, fontWeight: 300 }}>More</span>
        </button>
      </nav>

      {/* Mobile responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-bottom-nav { display: flex !important; }
          main { padding-bottom: 72px !important; }
        }
      `}</style>
    </div>
  )
}
