import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleCallback = async () => {
      const code = new URLSearchParams(window.location.search).get('code')

      if (!code) {
        // No code — redirect to login
        navigate('/login', { replace: true })
        return
      }

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error
        // Session is now in storage — navigate to platform
        navigate('/', { replace: true })
      } catch (err) {
        console.error('Auth callback error:', err)
        setError(err.message)
        setTimeout(() => navigate('/login', { replace: true }), 2000)
      }
    }

    handleCallback()
  }, [navigate])

  const font = "'DM Sans', -apple-system, sans-serif"

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff', fontFamily: font }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#ef4444' }}>{error}</p>
          <p style={{ fontSize: 12, color: '#ABABAB', marginTop: 4 }}>Redirecting to login…</p>
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
