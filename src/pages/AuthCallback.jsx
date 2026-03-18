// AuthCallback — implicit flow.
// detectSessionInUrl: true processes the #access_token hash fragment automatically.
// This page just waits for the session to appear, then redirects home.
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
        subscription.unsubscribe()
        window.location.replace('/')
      }
    })
    // Fallback: if no session after 5s, go to login
    const timer = setTimeout(() => {
      subscription.unsubscribe()
      window.location.replace('/login')
    }, 5000)
    return () => { subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,0.08)', borderTopColor: '#1A1A1A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 13, color: '#ABABAB', fontFamily: "'DM Sans', sans-serif" }}>Signing you in…</p>
      </div>
    </div>
  )
}
