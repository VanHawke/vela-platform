// FUTURE: optional auto-logout after N minutes of inactivity.
// Configurable in Settings → Profile (default OFF).
// Implementation: useEffect with mousedown/keydown listeners + setTimeout that calls supabase.auth.signOut().
// Deferred until requested — Sunny flagged 11 April 2026.
import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import { applyFavicon } from '@/lib/favicon'
// Design tokens — hardcoded (matching Sequences.jsx)
const C = {
  bg: '#1c1c24',
  card: '#1c1c24',
  cardHover: '#1c1c24',
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.10)',
  text: '#f4f4f6',
  textSec: '#9b9ba3',
  textTer: '#7e7e88',
  textMut: '#56565e',
  purple: '#7c5cfc',
  teal: '#7c5cfc',
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
import KikoVoice from '../kiko/KikoVoice'
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
  { id: 'sequences', label: 'Campaigns', path: '/campaigns', Icon: Zap },
  { id: 'linkedin', label: 'LinkedIn Queue', path: '/linkedin', Icon: Linkedin },
]
// Super-admin-only nav items appended to ALL_NAV at runtime if user role is super_admin.
// Health Center surfaces system_health alerts (replaces the old health-warning emails).
const ADMIN_NAV = [
  { id: 'health', label: 'Health Center', path: '/admin/system', Icon: Activity },
]
const VALID_NAV_IDS = new Set(ALL_NAV.map(n => n.id))
const DEFAULT_TOP_IDS = ['home', 'command-centre', 'pipeline', 'partnership-matrix', 'sequences']
const TOP_NAV_STORAGE_KEY = 'kiko_top_nav_v2'

function getTopNavIds() {
  try {
    const s = localStorage.getItem(TOP_NAV_STORAGE_KEY)
    if (s) {
      const parsed = JSON.parse(s)
      // Remove stale items that no longer exist in nav
      const cleaned = parsed.filter(id => VALID_NAV_IDS.has(id))
      if (cleaned.length !== parsed.length) {
        localStorage.setItem('kiko_top_nav_v2', JSON.stringify(cleaned.length > 0 ? cleaned : DEFAULT_TOP_IDS))
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
  '/organisations': 'Organisations', '/campaigns': 'Campaigns', '/sequences': 'Campaigns', '/inbox': 'Inbox', '/segments': 'Segments', '/packs': 'Vertical Pack', '/targets': 'Targets',
  '/settings': 'Settings', '/dashboard': 'Dashboard',
}

export default function Layout({ user }) {
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

  // Onboarding check — show modal for users who haven't completed onboarding
  useEffect(() => {
    if (!user?.id) return
    supabase.from('user_settings').select('onboarded').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (!data?.onboarded) setShowOnboarding(true) })
  }, [user?.id])

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
  const [customLogo, setCustomLogo] = useState(() => { try { return localStorage.getItem('custom_logo_url') } catch { return null } })
  const avatarRef = useRef(null)

  // Listen for custom logo changes
  useEffect(() => {
    const handler = () => { try { setCustomLogo(localStorage.getItem('custom_logo_url')) } catch {} }
    window.addEventListener('kiko_logo_updated', handler)
    return () => window.removeEventListener('kiko_logo_updated', handler)
  }, [])

  // Apply custom favicon on load (Safari-safe remove-and-recreate via applyFavicon helper)
  useEffect(() => {
    try {
      const faviconUrl = localStorage.getItem('custom_favicon_url')
      if (faviconUrl) applyFavicon(faviconUrl)
    } catch {}
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
                <span style={{ fontSize: 15, fontWeight: 600, color: '#9b9ba3', fontFamily: C.font, letterSpacing: '0.12em' }}>VAN HAWKE<sup style={{ fontSize: 8, verticalAlign: 'super', opacity: 0.5 }}>™</sup></span>
              </>
            )}
          </button>
        </div>

        {/* Center: Pill tab group — absolute-positioned for true viewport centering
            (was flex:1 between logo and kiko avatar, which made the centering depend
            on whichever side had more content — looked off-center to Sunny) */}
        <div className="desktop-top-nav" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: 3, background: 'rgba(40,40,46,0.55)', backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)', borderRadius: 14, padding: 4, border: `0.5px solid rgba(255,255,255,0.08)`, borderTop: `0.5px solid rgba(255,255,255,0.12)`, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
            {TABS.map(tab => {
              const active = isTabActive(tab.path)
              return (
                <button key={tab.path} onClick={() => {
                  if (tab.path === '/') { setKikoMessages([]); setKikoConvId(null); setKikoResetKey(k => k + 1) }
                  nav(tab.path)
                }} style={{
                  padding: '8px 22px', borderRadius: 50, border: 'none',
                  background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: active ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.6)',
                  fontSize: 14, fontWeight: active ? 500 : 400, cursor: 'pointer', fontFamily: C.font,
                  boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.2)' : 'none',
                  transition: 'all 0.2s',
                }}
                  onMouseOver={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}}
                  onMouseOut={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'transparent' }}}
                >{tab.label}</button>
              )
            })}
            {/* More tab with dropdown */}
            <div ref={moreRef} style={{ position: 'relative' }}>
              <button onClick={() => setMoreOpen(!moreOpen)} style={{
                padding: '8px 22px', borderRadius: 50, border: 'none',
                background: moreOpen ? 'rgba(255,255,255,0.10)' : 'transparent',
                color: moreOpen ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 400, cursor: 'pointer', fontFamily: C.font,
                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s',
              }}
                onMouseOver={e => { if (!moreOpen) { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}}
                onMouseOut={e => { if (!moreOpen) { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'transparent' }}}
              >
                More <ChevronDown size={11} style={{ transition: 'transform 0.2s', transform: moreOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {moreOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  width: 240, background: 'rgba(12,12,18,0.82)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
                  borderRadius: 14, border: `0.5px solid #3a3a42`,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 1px 0 #26262f inset', padding: '6px', zIndex: 300, animation: 'fadeIn 0.12s ease-out',
                }}>
                  {MORE_ITEMS.map(item => {
                    const Icon = item.Icon || Building2
                    return (
                    <button key={item.label} onClick={() => { nav(item.path); setMoreOpen(false) }} style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none',
                      background: loc.pathname === item.path ? '#26262f' : 'transparent',
                      color: loc.pathname === item.path ? '#f4f4f6' : '#7e7e88', textAlign: 'left',
                      fontSize: 13, fontWeight: 300, cursor: 'pointer', fontFamily: C.font,
                      display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                    }}
                      onMouseOver={e => { e.currentTarget.style.background = '#26262f'; e.currentTarget.style.color = '#f4f4f6' }}
                      onMouseOut={e => { e.currentTarget.style.background = loc.pathname === item.path ? '#26262f' : 'transparent'; e.currentTarget.style.color = loc.pathname === item.path ? '#f4f4f6' : '#7e7e88' }}
                    ><Icon size={14} />{item.label}</button>
                  )})}
                  {MORE_ITEMS.length > 0 && <div style={{ height: 1, background: 'rgba(124,92,252,0.05)', margin: '4px 8px' }} />}
                  <button onClick={() => { nav('/settings'); setMoreOpen(false) }} style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none',
                    background: 'transparent', color: '#7e7e88', textAlign: 'left',
                    fontSize: 13, fontWeight: 300, cursor: 'pointer', fontFamily: C.font,
                    display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                  }}
                    onMouseOver={e => { e.currentTarget.style.background = '#26262f'; e.currentTarget.style.color = '#f4f4f6' }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7e7e88' }}
                  ><Settings size={14} />Settings</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Voice status + ⌘K pill + mobile menu + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Multi-conversation indicator — shows other parallel active threads */}
          <ThreadIndicator
            user={user}
            currentConvId={kikoConvId}
            onSwitchThread={(thread) => {
              // Surface to KikoChat outlet so the thread becomes the active conversation
              setKikoConvId(thread.id)
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('kiko_load_conversation', { detail: thread }))
              }
            }}
          />
          {/* Listening pill — only when voice is active */}
          {voiceActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 50, background: 'rgba(6,214,160,0.04)', border: '1.5px solid rgba(6,214,160,0.1)', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(6,214,160,0.7)', animation: 'kikoBreathe 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(6,214,160,0.6)', fontFamily: 'var(--font)' }}>{voiceStatus}</span>
            </div>
          )}
          {/* Mobile hamburger — visible only below 768px */}
          <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{
            display: 'none', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 10, border: '1px solid #26262f',
            background: mobileMenuOpen ? '#26262f' : 'rgba(124,92,252,0.04)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {mobileMenuOpen ? <X size={16} color="#9b9ba3" /> : <Menu size={16} color="#9b9ba3" />}
          </button>
          {/* Command palette trigger */}
          <button onClick={() => setPaletteOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 50, border: '0.5px solid #26262f',
            background: 'rgba(124,92,252,0.04)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            cursor: 'pointer', fontFamily: 'var(--font)',
            color: '#56565e', fontSize: 13, transition: 'all 0.15s',
            boxShadow: 'inset 0 1px 0 #26262f',
          }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(124,92,252,0.15)'; e.currentTarget.style.background = 'rgba(124,92,252,0.07)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = '#26262f'; e.currentTarget.style.background = 'rgba(124,92,252,0.04)' }}
          >
            <Search size={14} />
            <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.6 }}>&#8984;K</span>
          </button>

          {/* User avatar dropdown */}
          <div ref={avatarRef} style={{ position: 'relative' }}>
            <button onClick={() => setAvatarOpen(!avatarOpen)} style={{
              width: 28, height: 28, borderRadius: '50%', border: '0.5px solid #26262f', cursor: 'pointer',
              background: profile.profile_photo_url ? 'transparent' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, overflow: 'hidden',
            }}>
              {profile.profile_photo_url ? (
                <img src={profile.profile_photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 11, fontWeight: 500, color: '#f4f4f6', fontFamily: 'var(--font)' }}>{initials}</span>
              )}
            </button>
            {avatarOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                width: 200, background: 'rgba(124,92,252,0.035)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
                borderRadius: 18, border: '0.5px solid #26262f',
                boxShadow: 'inset 0 1px 0 #26262f, 0 8px 40px rgba(0,0,0,0.5)',
                padding: '6px', zIndex: 400, animation: 'fadeIn 0.15s ease-out',
              }}>
                <div style={{ padding: '8px 12px 10px', borderBottom: '0.5px solid #26262f', marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#f4f4f6', fontFamily: 'var(--font)' }}>
                    {profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user?.email?.split('@')[0] || 'User'}
                  </div>
                  <div style={{ fontSize: 12, color: '#56565e', fontFamily: 'var(--font)', marginTop: 2 }}>{user?.email}</div>
                </div>
                <button onClick={() => { nav('/settings'); setAvatarOpen(false) }} style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10, border: 'none',
                  background: 'transparent', color: '#7e7e88', textAlign: 'left',
                  fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
                }}
                  onMouseOver={e => { e.currentTarget.style.background = '#26262f'; e.currentTarget.style.color = '#f4f4f6' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7e7e88' }}
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

      {/* Mobile navigation menu overlay */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 48, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          zIndex: 240, animation: 'fadeIn 0.15s ease-out',
        }} onClick={() => setMobileMenuOpen(false)}>
          <div style={{
            background: 'rgba(124,92,252,0.035)', borderBottom: '0.5px solid #26262f',
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
                  background: active ? '#26262f' : 'transparent',
                  color: active ? '#f4f4f6' : '#9b9ba3',
                  fontSize: 15, fontWeight: active ? 400 : 300, cursor: 'pointer', fontFamily: C.font,
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', transition: 'all 0.15s',
                }}>
                  <Icon size={16} />{item.label}
                </button>
              )
            })}
            <div style={{ height: 1, background: '#26262f', margin: '6px 8px' }} />
            <button onClick={() => { nav('/settings'); setMobileMenuOpen(false) }} style={{
              width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none',
              background: 'transparent', color: '#7e7e88',
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
        background: 'rgba(124,92,252,0.03)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
        borderTop: '0.5px solid #26262f',
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
              color: active ? '#f4f4f6' : '#7e7e88',
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
          color: '#7e7e88', fontFamily: C.font,
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
