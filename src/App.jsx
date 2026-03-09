import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import LoginPage from '@/components/auth/LoginPage'
import Layout from '@/components/layout/Layout'
import KikoChat from '@/components/kiko/KikoChat'
import Settings from '@/components/settings/Settings'

// Placeholder pages for Phase 1 nav items
function PlaceholderPage({ title }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-white mb-1">{title}</h2>
        <p className="text-sm text-white/30">Coming in Phase 2</p>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user || null)
    }).catch(() => {
      setSession(null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Loading
  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route element={session ? <Layout user={user} /> : <Navigate to="/login" replace />}>
          <Route index element={<KikoChat user={user} />} />
          <Route path="home" element={<KikoChat user={user} />} />
          <Route path="email" element={<PlaceholderPage title="Email" />} />
          <Route path="calendar" element={<PlaceholderPage title="Calendar" />} />
          <Route path="settings" element={<Settings user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
