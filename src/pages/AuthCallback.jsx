// AuthCallback — handles both implicit (hash) and PKCE (code) flows.
// With implicit flow, detectSessionInUrl processes #access_token automatically.
// This page is a safety fallback — it redirects to login or home.
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  useEffect(() => {
    const run = async () => {
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        // PKCE flow — exchange code for session
        try {
          await supabase.auth.exchangeCodeForSession(code)
        } catch {}
      }
      // Let onAuthStateChange handle the session, then navigate
      const { data: { session } } = await supabase.auth.getSession()
      window.location.replace(session ? '/' : '/login')
    }
    run()
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
