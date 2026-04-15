import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import LoginPage from '@/components/auth/LoginPage'
import AuthCallback from '@/pages/AuthCallback'
import Layout from '@/components/layout/Layout'
import KikoChat from '@/components/kiko/KikoChat'
import Settings from '@/components/settings/Settings'
import PermissionGate from '@/components/PermissionGate'
// Lazy-loaded pages (code-split for bundle size reduction)
const Pipeline = lazy(() => import('@/pages/Pipeline'))
const Contacts = lazy(() => import('@/pages/Contacts'))
const ContactDetail = lazy(() => import('@/pages/ContactDetail'))
const Organisations = lazy(() => import('@/pages/Organisations'))
const OutreachIntelligence = lazy(() => import('@/pages/OutreachIntelligence'))
const PartnershipMatrix = lazy(() => import('@/pages/PartnershipMatrix'))
const CommercialCalendar = lazy(() => import('@/pages/CommercialCalendarRouter'))
const CommercialCalendarLegora = lazy(() => import('@/pages/CommercialCalendarLegora'))
const KikoCode = lazy(() => import('@/pages/KikoCode'))
const Admin = lazy(() => import('@/pages/Admin'))
const AdminSystem = lazy(() => import('@/pages/AdminSystem'))
const MemoryConsole = lazy(() => import('@/pages/MemoryConsole'))

const Campaigns = lazy(() => import('@/pages/Campaigns'))
const LinkedInQueue = lazy(() => import('@/pages/LinkedInQueue'))

const SequenceDetail = lazy(() => import('@/pages/SequenceDetail'))

const INACTIVITY_MS   = 20 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

function AdminRoute({ children }) {
  const [allowed, setAllowed] = useState(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAllowed(session?.user?.app_metadata?.role === 'super_admin')
    })
  }, [])
  if (allowed === null) return null
  if (!allowed) return <div style={{ padding: 32, fontSize: 13 }}>Access denied.</div>
  return children
}

const Spinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'rgba(255,255,255,0.04)' }}>
    <div style={{ width: 24, height: 24, border: '2px solid rgba(0,0,0,0.1)', borderTopColor: 'rgba(255,255,255,0.12)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
  </div>
)

export default function App() {
  // DEV BYPASS — when running on localhost, fake a session so we can preview the redesign without OAuth roundtripping to production
  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  const [session, setSession] = useState(isLocalhost ? { user: { email: 'sunny@vanhawke.com', id: 'dev-preview' } } : undefined)
  const [user, setUser]       = useState(isLocalhost ? { email: 'sunny@vanhawke.com', id: 'dev-preview' } : null)
  const timerRef    = useRef(null)
  const activeRef   = useRef(false)

  // ── 20-min inactivity timeout — per tab, independent ──
  const resetTimer = useCallback(() => {
    if (!activeRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(signOut, INACTIVITY_MS)
  }, [])

  useEffect(() => {
    if (!session) {
      activeRef.current = false
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
      return
    }
    activeRef.current = true
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [session, resetTimer])

  // ── Auth listener — single source of truth ──
  useEffect(() => {
    // DEV BYPASS — skip auth listener on localhost
    if (isLocalhost) return
    // onAuthStateChange fires INITIAL_SESSION immediately on mount with
    // whatever is in localStorage (or null). For implicit flow, when Google
    // redirects back with #access_token=... in the URL, detectSessionInUrl
    // processes it and fires SIGNED_IN automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESH_FAILED') {
        setSession(null)
        setUser(null)
        return
      }
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(sess ?? null)
        setUser(sess?.user ?? null)
        // Clean up hash fragment left by implicit flow token detection
        if (sess && window.location.hash.includes('access_token')) {
          window.history.replaceState(null, '', window.location.pathname)
        }
        // Auto-sync Google token to user_tokens table on sign-in
        if (sess?.provider_token && sess?.user?.email) {
          fetch('/api/sync-google-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: sess.user.email,
              access_token: sess.provider_token,
              refresh_token: sess.provider_refresh_token || '',
            }),
          }).catch(() => {}) // non-blocking
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Spinner />

  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#14141a', color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>Loading...</div>}>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/admin" element={session ? <AdminRoute><Admin /></AdminRoute> : <Navigate to="/login" replace />} />
        <Route path="/admin/system" element={session ? <AdminRoute><AdminSystem /></AdminRoute> : <Navigate to="/login" replace />} />
        <Route element={session ? <Layout key="app" user={user} /> : <Navigate to="/login" replace />}>
          <Route index element={<KikoChat user={user} />} />
          <Route path="home" element={<KikoChat user={user} />} />
          <Route path="dashboard" element={<KikoChat user={user} />} />
          <Route path="pipeline" element={<PermissionGate pageKey="pipeline" user={user}><Pipeline user={user} /></PermissionGate>} />
          <Route path="contacts" element={<PermissionGate pageKey="contacts" user={user}><Contacts user={user} /></PermissionGate>} />
          <Route path="contacts/:id" element={<PermissionGate pageKey="contacts" user={user}><ContactDetail user={user} /></PermissionGate>} />
          <Route path="organisations" element={<PermissionGate pageKey="organisations" user={user}><Organisations user={user} /></PermissionGate>} />
          <Route path="companies" element={<Navigate to="/organisations" replace />} />
          <Route path="deals" element={<Navigate to="/pipeline" replace />} />
          <Route path="tasks" element={<Navigate to="/command-centre" replace />} />
          <Route path="email" element={<Navigate to="/command-centre" replace />} />
          <Route path="command-centre" element={<PermissionGate pageKey="command_centre" user={user}><OutreachIntelligence user={user} /></PermissionGate>} />
          {/* News Signals removed — replaced by Partnership Detection alerts */}
          <Route path="partnership-matrix" element={<PermissionGate pageKey="partnership_matrix" user={user}><PartnershipMatrix user={user} /></PermissionGate>} />
          <Route path="calendar" element={<PermissionGate pageKey="race_calendar" user={user}><CommercialCalendar user={user} /></PermissionGate>} />
          {/* Knowledge Library removed — documents accessible via Kiko chat upload */}

          <Route path="campaigns" element={<PermissionGate pageKey="campaigns" user={user}><Campaigns user={user} /></PermissionGate>} />
          <Route path="sequences" element={<Navigate to="/campaigns" replace />} />
          <Route path="campaigns/:id" element={<SequenceDetail user={user} />} />
          <Route path="sequences/:id" element={<SequenceDetail user={user} />} />
          <Route path="linkedin" element={<LinkedInQueue user={user} />} />
          <Route path="inbox" element={<Navigate to="/command-centre" replace />} />
          <Route path="segments" element={<Navigate to="/campaigns" replace />} />
          <Route path="packs" element={<Navigate to="/settings" replace />} />
          <Route path="targets" element={<Navigate to="/command-centre" replace />} />
          <Route path="kikocode" element={<KikoCode user={user} />} />
          <Route path="settings" element={<Settings user={user} />} />
          <Route path="memory" element={<AdminRoute><MemoryConsole user={user} /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
