import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import LoginPage from '@/components/auth/LoginPage'
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

function AdminRoute({ children }) {
  const [allowed, setAllowed] = useState(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAllowed(session?.user?.app_metadata?.role === 'super_admin')
    })
  }, [])
  if (allowed === null) return null
  if (!allowed) return <div className="p-8 text-[#1A1A1A] text-sm">Access denied.</div>
  return children
}

// Detect PKCE OAuth callback — URL has ?code= param (Supabase PKCE flow)
// or legacy implicit flow — URL hash has access_token
function isOAuthCallback() {
  const params = new URLSearchParams(window.location.search)
  return params.has('code') || window.location.hash.includes('access_token')
}

export default function App() {
  // undefined = resolving (show spinner)
  // null      = no session (show login)
  // object    = authenticated (show platform)
  const [session, setSession] = useState(undefined)
  const [user, setUser] = useState(null)

  useEffect(() => {
    const onCallback = isOAuthCallback()

    if (!onCallback) {
      // Normal load: getSession() is fast (reads from storage), use it to
      // set initial state immediately, then onAuthStateChange handles updates.
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        setSession(s ?? null)
        setUser(s?.user ?? null)
      }).catch(() => {
        setSession(null)
      })
    }
    // If onCallback: stay in undefined (spinner) until SIGNED_IN fires below.
    // This prevents the router flashing to /login while the PKCE code exchange runs.

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(sess)
        setUser(sess?.user ?? null)
      } else if (event === 'SIGNED_OUT') {
        setSession(null)
        setUser(null)
      } else if (event === 'INITIAL_SESSION') {
        // Only use INITIAL_SESSION to resolve spinner on non-callback loads
        // (on callback loads getSession() is skipped and we wait for SIGNED_IN)
        if (onCallback && sess) {
          setSession(sess)
          setUser(sess?.user ?? null)
        } else if (onCallback && !sess) {
          // PKCE exchange in progress — stay as undefined (spinner), SIGNED_IN will follow
        }
        // non-callback: getSession() already handled it above
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#fff' }}>
        <div className="h-6 w-6 border-2 border-black/10 border-t-[#1A1A1A] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
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
