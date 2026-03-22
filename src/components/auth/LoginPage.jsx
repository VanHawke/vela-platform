import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import T from '@/lib/theme'
import AuroraCanvas from '@/components/AuroraCanvas'
import SmokeTrailWave from '@/components/kiko/SmokeTrailWave'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)

  const googleLogin = async () => {
    setGLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
        redirectTo: `${window.location.origin}/login`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      }
    })
    if (error) { setError(error.message); setGLoading(false) }
  }

  const emailLogin = async (e) => {
    e.preventDefault(); setError('')
    if (!email || !password) { setError('Email and password required.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
  }

  const fadeUp = (delay) => ({
    animation: `kikoFadeUp 0.8s ease-out ${delay}s both`,
  })

  const inputStyle = {
    width: '100%', height: 48, borderRadius: 50,
    border: '0.5px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)',
    padding: '0 20px', fontSize: 14, color: T.text, outline: 'none',
    fontFamily: T.font, fontWeight: 300, transition: 'border-color 0.3s',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100vw', height: '100vh', background: T.bg, fontFamily: T.font, position: 'relative', overflow: 'hidden' }}>
      {/* Aurora orbs background */}
      <AuroraCanvas />

      <div style={{ width: '100%', maxWidth: 400, textAlign: 'center', position: 'relative', zIndex: 5, padding: '0 24px' }}>

        {/* Brand logo — VAN HAWKE pill */}
        <div style={{ marginBottom: 48, ...fadeUp(0) }}>
          <div style={{ display: 'inline-flex', height: 38, padding: '0 18px', borderRadius: 50, background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', alignItems: 'center', gap: 8, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>VAN HAWKE</span>
          </div>
        </div>

        {/* Kiko avatar — smoke trail wave */}
        <div style={{ width: '100%', maxWidth: 340, margin: '0 auto 16px', overflow: 'visible', padding: '10px 0', ...fadeUp(0.15) }}>
          <SmokeTrailWave width={340} height={60} />
        </div>

        {/* kiko label */}
        <h1 style={{ fontSize: 28, fontWeight: 200, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.03em', margin: '0 0 6px', ...fadeUp(0.3) }}>kiko</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.15)', fontWeight: 300, margin: '0 0 40px', ...fadeUp(0.4) }}>Your AI operating system</p>

        {/* Google OAuth — frosted glass pill */}
        <button onClick={googleLogin} disabled={gLoading} style={{
          width: '100%', height: 52, borderRadius: 50,
          border: '0.5px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(40px) saturate(1.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontSize: 14, fontWeight: 400, color: T.text, cursor: 'pointer', fontFamily: T.font,
          transition: 'all 0.3s',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.35)',
          marginBottom: 18, ...fadeUp(0.5),
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          {gLoading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> :
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
          Sign in with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, ...fadeUp(0.55) }}>
          <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.1)', fontWeight: 300 }}>or</span>
          <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
        </div>

        {/* Email form */}
        <form onSubmit={emailLogin}>
          <div style={fadeUp(0.6)}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 10 }}
              onFocus={e => e.target.style.borderColor = 'rgba(139,108,246,0.3)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
          </div>
          <div style={{ position: 'relative', marginBottom: 10, ...fadeUp(0.65) }}>
            <input type={showPw ? 'text' : 'password'} placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: 44 }}
              onFocus={e => e.target.style.borderColor = 'rgba(139,108,246,0.3)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
            <button type="button" onClick={() => setShowPw(!showPw)} style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.15)', padding: 0,
            }}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>

          {error && <p style={{ fontSize: 13, color: 'rgba(255,80,80,0.8)', background: 'rgba(255,80,80,0.06)', padding: '8px 14px', borderRadius: 50, margin: '0 0 10px', border: '0.5px solid rgba(255,80,80,0.1)', fontFamily: T.font }}>{error}</p>}

          {/* Sign in — gradient pill */}
          <div style={fadeUp(0.7)}>
            <button type="submit" disabled={loading} style={{
              width: '100%', height: 52, borderRadius: 50,
              background: T.accentGradient, color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 400, cursor: 'pointer', fontFamily: T.font,
              letterSpacing: '0.01em', transition: 'all 0.3s',
              boxShadow: '0 8px 32px rgba(139,108,246,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
              opacity: loading ? 0.6 : 1,
            }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(139,108,246,0.35), inset 0 1px 0 rgba(255,255,255,0.2)' }}}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(139,108,246,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
            >{loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sign in'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
