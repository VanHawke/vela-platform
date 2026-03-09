import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import LoginPage from '@/components/auth/LoginPage'

function HomePage() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold text-white">Vela Platform</h1>
        <p className="text-white/40">Logged in as {user?.email || '...'}</p>
        <button
          onClick={handleLogout}
          className="text-sm text-white/30 hover:text-white/60 transition-colors underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Loading state
  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/*"
          element={session ? <HomePage /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}
