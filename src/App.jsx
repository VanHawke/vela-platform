import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import LoginPage from '@/components/auth/LoginPage'
import AuthCallback from '@/pages/AuthCallback'
import Layout from '@/components/layout/Layout'
import KikoChat from '@/components/kiko/KikoChat'
import Settings from '@/components/settings/Settings'
import Dashboard from '@/pages/Dashboard'
import Pipeline from '@/pages/Pipeline'
import Contacts from '@/pages/Contacts'
import ContactDetail from '@/pages/ContactDetail'
import Organisations from '@/pages/Organisations'
import Tasks from '@/pages/Tasks'
import Documents from '@/pages/Documents'
import Email from '@/pages/Email'
import News from '@/pages/News'
import PartnershipMatrix from '@/pages/PartnershipMatrix'
import Calendar from '@/pages/Calendar'
import VelaCode from '@/pages/VelaCode'
import Admin from '@/pages/Admin'
import MemoryConsole from '@/pages/MemoryConsole'

const INACTIVITY_MS   = 20 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

function AdminRoute({ children }) {
  const [allowed, setAllowed] = useState(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setAllowed(user?.app_metadata?.role === 'super_admin')
    })
  }, [])
  if (allowed === null) return null
  if (!allowed) return <div className="p-8 text-[#1A1A1A] text-sm">Access denied.</div>
  return children
}

const Spinner = () => (
  <div className="flex items-center justify-center h-screen" style={{ background: '#fff' }}>
    <div className="h-6 w-6 border-2 border-black/10 border-t-[#1A1A1A] rounded-full animate-spin" />
  </div>
)

// Hard sign out — clears everything regardless of session state
export async function hardSignOut() {
  try { await supabase.auth.signOut({ scope: 'global' }) } catch {}
  // Belt-and-braces: clear all Supabase auth keys from localStorage
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') || k.includes('supabase'))
      .forEach(k => localStorage.removeItem(k))
  } catch {}
  window.location.replace('/login')
}

export default function App() {
  // undefined = still resolving, null = no session, object = valid session
  const [session, setSession] = useState(undefined)
  const [user, setUser]       = useState(null)
  const timerRef              = useRef(null)
  const loggedInRef           = useRef(false)

  // ── 20-min per-tab inactivity logout ──────────────────
  const startInactivityTimer = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(hardSignOut, INACTIVITY_MS)
  }, [])

  const resetInactivityTimer = useCallback(() => {
    if (loggedInRef.current) startInactivityTimer()
  }, [startInactivityTimer])

  useEffect(() => {
    if (!session) {
      loggedInRef.current = false
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, resetInactivityTimer))
      return
    }
    loggedInRef.current = true
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, resetInactivityTimer, { passive: true }))
    startInactivityTimer()
    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, resetInactivityTimer))
    }
  }, [session, startInactivityTimer, resetInactivityTimer])

  // ── Auth — verified session only ──────────────────────
  // Uses getUser() to make a live network request confirming the JWT is valid.
  // Never trusts the cached session from localStorage alone.
  useEffect(() => {
    // Clean up old storageKey remnant
    try { localStorage.removeItem('vela-auth-token') } catch {}

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESH_FAILED') {
        setSession(null)
        setUser(null)
        return
      }

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (!sess) {
          setSession(null)
          setUser(null)
          return
        }
        // Verify JWT is genuinely valid with a live network call
        const { data: { user: verifiedUser }, error } = await supabase.auth.getUser(sess.access_token)
        if (error || !verifiedUser) {
          // JWT invalid — clear everything
          setSession(null)
          setUser(null)
          return
        }
        setSession(sess)
        setUser(verifiedUser)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Spinner />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/admin" element={session ? <AdminRoute><Admin /></AdminRoute> : <Navigate to="/login" replace />} />
        <Route element={session ? <Layout key={user?.id || 'auth'} user={user} /> : <Navigate to="/login" replace />}>
          <Route index element={<KikoChat user={user} />} />
          <Route path="home" element={<KikoChat user={user} />} />
          <Route path="dashboard" element={<Dashboard user={user} />} />
          <Route path="pipeline" element={<Pipeline user={user} />} />
          <Route path="contacts" element={<Contacts user={user} />} />
          <Route path="contacts/:id" element={<ContactDetail user={user} />} />
          <Route path="organisations" element={<Organisations user={user} />} />
          <Route path="companies" element={<Navigate to="/organisations" replace />} />
          <Route path="deals" element={<Navigate to="/pipeline" replace />} />
          <Route path="tasks" element={<Tasks user={user} />} />
          <Route path="email" element={<Email user={user} />} />
          <Route path="news" element={<News user={user} />} />
          <Route path="partnership-matrix" element={<PartnershipMatrix user={user} />} />
          <Route path="calendar" element={<Calendar user={user} />} />
          <Route path="documents" element={<Documents user={user} />} />
          <Route path="velacode" element={<VelaCode user={user} />} />
          <Route path="settings" element={<Settings user={user} />} />
          <Route path="memory" element={<AdminRoute><MemoryConsole user={user} /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
