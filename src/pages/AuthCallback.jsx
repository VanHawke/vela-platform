import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code')

        if (!code) {
          // No code param — go to login
          window.location.replace('/login')
          return
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) throw error

        if (data?.session) {
          // Full page reload — ensures App.jsx remounts with fresh session from localStorage.
          // Never use React Router navigate here: App is already mounted, getSession()
          // already ran (returned null before login), and client-side nav can miss the
          // SIGNED_IN event. A hard redirect guarantees a clean init.
          window.location.replace('/')
        } else {
          throw new Error('No session returned after code exchange')
        }
      } catch (err) {
        console.error('[AuthCallback] error:', err)
        setError(err.message || 'Authentication failed')
        setTimeout(() => window.location.replace('/login'), 2500)
      }
    }

    handleCallback()
  }, [])

  const font = "'DM Sans', -apple-system, sans-serif"

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff', fontFamily: font }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 6 }}>Sign-in failed: {error}</p>
          <p style={{ fontSize: 12, color: '#ABABAB' }}>Returning to login…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff', fontFamily: font }}>
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
        <p style={{ fontSize: 13, color: '#ABABAB' }}>Signing you in…</p>
      </div>
    </div>
  )
}
