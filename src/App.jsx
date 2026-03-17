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

export default function App() {
  const [session, setSession] = useState(undefined)
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user || null)
      // Small delay to let Supabase RLS headers settle after OAuth redirect
      if (session) setTimeout(() => setReady(true), 300)
      else setReady(true)
    }).catch(() => { setSession(null); setReady(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
      setUser(sess?.user || null)
      if (sess && !ready) setTimeout(() => setReady(true), 300)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined || !ready) {
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
