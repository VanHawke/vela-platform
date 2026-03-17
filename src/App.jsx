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

const Spinner = () => (
  <div className="flex items-center justify-center h-screen" style={{ background: '#fff' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1.5s linear infinite' }}>
          <circle cx="12" cy="12" r="3" fill="#fff"/>
          <path d="M12 2C12 2 17 5.5 17 8.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
          <path d="M22 12C22 12 18.5 17 15.5 17" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
          <path d="M12 22C12 22 7 18.5 7 15.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
          <path d="M2 12C2 12 5.5 7 8.5 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </div>
      <p style={{ fontSize: 13, color: '#ABABAB', fontFamily: "'DM Sans', -apple-system, sans-serif" }}>Signing you in…</p>
    </div>
  </div>
)

export default function App() {
  // undefined = resolving | null = unauthenticated | object = authenticated
  const [session, setSession] = useState(undefined)
  const [user, setUser] = useState(null)

  useEffect(() => {
    const init = async () => {
      const code = new URLSearchParams(window.location.search).get('code')

      if (code) {
        // PKCE callback: exchange the code FIRST, then set session.
        // This runs before any React Router rendering, preventing the /login flash.
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          // Clean the ?code= from the URL without a page reload
          window.history.replaceState({}, '', window.location.pathname)
          setSession(data.session)
          setUser(data.session?.user ?? null)
        } catch (err) {
          console.error('PKCE exchange failed:', err)
          setSession(null)
        }
      } else {
        // Normal load: read existing session from storage
        const { data: { session: s } } = await supabase.auth.getSession()
        setSession(s ?? null)
        setUser(s?.user ?? null)
      }
    }

    init()

    // Keep session in sync for sign-out and token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      // Only update if we're already resolved (avoid overwriting during init)
      setSession(prev => {
        if (prev === undefined) return prev // still initialising, let init() handle it
        return sess ?? null
      })
      setUser(sess?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Spinner />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/auth/callback" element={session ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
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
