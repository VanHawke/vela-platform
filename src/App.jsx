import { useState, useEffect, useRef } from 'react'
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

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function PostLoginTransition({ user, onComplete }) {
  const [step, setStep] = useState(0)
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'there'

  useEffect(() => {
    setTimeout(() => setStep(1), 200)   // badge
    setTimeout(() => setStep(2), 700)   // greeting
    setTimeout(() => setStep(3), 1200)  // subtitle
    setTimeout(() => setStep(4), 1600)  // stats
    setTimeout(() => setStep(5), 2000)  // progress
    setTimeout(() => onComplete(), 3600) // done
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {step >= 1 && (
          <div style={{ width: 52, height: 52, borderRadius: 13, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'loginScaleIn 0.4s ease-out forwards' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ animation: 'loginVortexSpin 2s linear infinite' }}>
              <circle cx="12" cy="12" r="3" fill="#fff"/>
              <path d="M12 2C12 2 17 5.5 17 8.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
              <path d="M22 12C22 12 18.5 17 15.5 17" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
              <path d="M12 22C12 22 7 18.5 7 15.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
              <path d="M2 12C2 12 5.5 7 8.5 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </div>
        )}
        {step >= 2 && (
          <h2 style={{ marginTop: 20, fontSize: 24, fontWeight: 300, color: '#1A1A1A', animation: 'loginSlideUp 0.5s ease-out forwards' }}>
            {getGreeting()}, {firstName}
          </h2>
        )}
        {step >= 3 && (
          <p style={{ marginTop: 6, fontSize: 12, color: '#ABABAB', animation: 'loginSlideUp 0.4s ease-out forwards' }}>
            Kiko is syncing your latest data
          </p>
        )}
        {step >= 4 && (
          <div style={{ display: 'flex', gap: 28, marginTop: 28 }}>
            {[{ label: 'New alerts', value: '—' }, { label: 'Emails synced', value: '—' }, { label: 'Meetings today', value: '—' }].map((s, i) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: i < 2 ? 28 : 0 }}>
                <div style={{ textAlign: 'center', animation: `loginSlideRight 0.4s ${i * 0.15}s ease-out both` }}>
                  <div style={{ fontSize: 11, color: '#ABABAB', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: '#1A1A1A' }}>{s.value}</div>
                </div>
                {i < 2 && <div style={{ width: 1, height: 32, background: 'rgba(0,0,0,0.06)', animation: `loginFadeIn 0.3s ${i * 0.15 + 0.1}s ease-out both` }} />}
              </div>
            ))}
          </div>
        )}
        {step >= 5 && (
          <div style={{ width: 140, height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.06)', marginTop: 24, overflow: 'hidden', animation: 'loginFadeIn 0.3s ease-out forwards' }}>
            <div style={{ height: '100%', background: '#1A1A1A', borderRadius: 2, width: 0, animation: 'loginFillBar 1.4s ease-in-out forwards' }} />
          </div>
        )}
      </div>
    </div>
  )
}
export default function App() {
  const [session, setSession] = useState(undefined)
  const [user, setUser] = useState(null)
  const [showTransition, setShowTransition] = useState(false)
  const prevSession = useRef(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const isFreshLogin = !prevSession.current && session
      setSession(session)
      setUser(session?.user || null)
      if (isFreshLogin) setShowTransition(true)
      prevSession.current = session
    }).catch(() => setSession(null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      const wasMissing = !prevSession.current
      setSession(sess)
      setUser(sess?.user || null)
      if (wasMissing && sess) setShowTransition(true)
      prevSession.current = sess
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#FAFAFA' }}>
        <div className="h-6 w-6 border-2 border-black/10 border-t-[#1A1A1A] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {showTransition && session && (
        <PostLoginTransition user={user} onComplete={() => setShowTransition(false)} />
      )}
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
    </>
  )
}
